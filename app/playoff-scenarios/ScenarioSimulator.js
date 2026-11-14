
"use client";

import { useMemo, useState } from "react";

// =====================================================
// DIRTY P PLAYOFF PREDICTOR
// =====================================================

const REGULAR_SEASON_END_WEEK = 14;
const SIMULATION_COUNT = 25000;
const EXACT_GAME_LIMIT = 16;
const COMBINATIONS_PER_PAGE = 10;

const COLORS = {
  clinch: "#55c993",
  hunt: "#e6b65b",
  out: "#e47d83"
};

const number = x =>
  Number.isFinite(Number(x)) ? Number(x) : 0;

const percent = x =>
  `${(100 * (x || 0)).toFixed(1)}%`;

const played = t =>
  number(t.wins) +
  number(t.losses) +
  number(t.ties);

const winPct = t =>
  played(t)
    ? (number(t.wins) + number(t.ties) / 2) / played(t)
    : 0.5;

const avgPoints = t =>
  played(t)
    ? number(t.pointsFor) / played(t)
    : 100;

const clone = teams =>
  teams.map(t => ({ ...t }));

const divisionKey = t =>
  t.divisionId == null || t.divisionId === ""
    ? null
    : String(t.divisionId);

function compare(a, b, target = null, favor = 0) {
  const recordDifference =
    winPct(b) - winPct(a) ||
    number(b.wins) - number(a.wins);

  if (Math.abs(recordDifference) > 0.00000001) {
    return recordDifference;
  }

  if (
    target !== null &&
    favor !== 0 &&
    (a.ownerId === target || b.ownerId === target)
  ) {
    return a.ownerId === target ? -favor : favor;
  }

  return (
    number(b.pointsFor) - number(a.pointsFor) ||
    String(a.ownerName).localeCompare(
      String(b.ownerName)
    )
  );
}

// =====================================================
// LEAGUE PLAYOFF FIELD
// =====================================================

function getPlayoffField(
  teams,
  playoffCount,
  target = null,
  favor = 0
) {
  const sorter = (a, b) =>
    compare(a, b, target, favor);

  const divisions = new Map();

  for (const t of teams) {
    const key = divisionKey(t);

    if (key === null) continue;

    if (!divisions.has(key)) {
      divisions.set(key, []);
    }

    divisions.get(key).push(t);
  }

  const useDivisions =
    divisions.size === 2 &&
    teams.every(t => divisionKey(t) !== null);

  if (!useDivisions) {
    return new Set(
      [...teams]
        .sort(sorter)
        .slice(0, playoffCount)
        .map(t => t.ownerId)
    );
  }

  const divisionWinners = [...divisions.values()]
    .map(group => [...group].sort(sorter)[0])
    .sort(sorter)
    .slice(0, playoffCount);

  const divisionWinnerIds = new Set(
    divisionWinners.map(t => t.ownerId)
  );

  const wildCards = teams
    .filter(t => !divisionWinnerIds.has(t.ownerId))
    .sort(sorter)
    .slice(
      0,
      Math.max(
        0,
        playoffCount - divisionWinners.length
      )
    );

  return new Set(
    [...divisionWinners, ...wildCards]
      .map(t => t.ownerId)
  );
}

// =====================================================
// TEAM STRENGTH / MATCHUP ODDS
// =====================================================

function matchupProbability(a, b) {
  if (!a || !b) return 0.5;

  const strength = t => {
    const reliability =
      played(t) / (played(t) + 4);

    const scoring = Math.max(
      -0.16,
      Math.min(
        0.16,
        (avgPoints(t) - 100) / 260
      )
    );

    return reliability * (
      0.34 * (winPct(t) - 0.5) +
      scoring
    );
  };

  return Math.max(
    0.15,
    Math.min(
      0.85,
      0.5 + strength(a) - strength(b)
    )
  );
}

function seededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(
      t ^ (t >>> 15),
      t | 1
    );

    t ^= t + Math.imul(
      t ^ (t >>> 7),
      t | 61
    );

    return (
      ((t ^ (t >>> 14)) >>> 0) /
      4294967296
    );
  };
}

// =====================================================
// APPLY OUTCOMES
// =====================================================

function applyGames(teams, games, winners) {
  const state = clone(teams);

  const byId = new Map(
    state.map(t => [t.ownerId, t])
  );

  games.forEach((game, index) => {
    const home = byId.get(game.homeId);
    const away = byId.get(game.awayId);

    if (!home || !away) return;

    if (winners[index] === game.homeId) {
      home.wins++;
      away.losses++;
    } else {
      away.wins++;
      home.losses++;
    }
  });

  return state;
}

// =====================================================
// THREE MUTUALLY EXCLUSIVE OUTCOME CATEGORIES
//
// CLINCH: Qualified even with unfavorable
//         future points tiebreakers.
//
// HUNT:   Can qualify, but some points
//         tiebreaker uncertainty remains.
//
// OUT:    Cannot qualify, even with a
//         favorable points tiebreaker.
//
// These categories are based on modeled rules,
// not official ESPN clinching decisions.
// =====================================================

function classify(state, playoffCount, finalScoresKnown) {
  const categories = new Map();

  if (finalScoresKnown) {
    const field = getPlayoffField(
      state,
      playoffCount
    );

    for (const team of state) {
      categories.set(
        team.ownerId,
        field.has(team.ownerId)
          ? "clinch"
          : "out"
      );
    }

    return categories;
  }

  for (const team of state) {
    const id = team.ownerId;

    const possible = getPlayoffField(
      state,
      playoffCount,
      id,
      1
    ).has(id);

    if (!possible) {
      categories.set(id, "out");
      continue;
    }

    const guaranteed = getPlayoffField(
      state,
      playoffCount,
      id,
      -1
    ).has(id);

    categories.set(
      id,
      guaranteed ? "clinch" : "hunt"
    );
  }

  return categories;
}

// =====================================================
// MAIN PREDICTION ENGINE
// =====================================================

function runModel({
  teams,
  games,
  playoffCount,
  picks = {},
  season,
  finalScoresKnown = false
}) {
  const indexedGames = games.map(
    (game, index) => ({
      ...game,
      index
    })
  );

  const pending = indexedGames.filter(
    game => !picks[game.id]
  );

  const exact =
    pending.length <= EXACT_GAME_LIMIT;

  const iterations = exact
    ? 2 ** pending.length
    : SIMULATION_COUNT;

  const teamMap = new Map(
    teams.map(t => [t.ownerId, t])
  );

  const probabilities = pending.map(game =>
    matchupProbability(
      teamMap.get(game.homeId),
      teamMap.get(game.awayId)
    )
  );

  const random = seededRandom(
    season +
    7919 +
    Object.entries(picks).reduce(
      (sum, [key, id]) =>
        sum +
        String(key).length * 17 +
        Number(id),
      0
    )
  );

  const totals = new Map(
    teams.map(t => [
      t.ownerId,
      {
        clinch: 0,
        hunt: 0,
        out: 0,
        playoff: 0,
        weighted: 0
      }
    ])
  );

  const entries = [];
  let totalWeight = 0;

  for (
    let iteration = 0;
    iteration < iterations;
    iteration++
  ) {
    const winners = Array(games.length);

    let weight = 1;

    indexedGames.forEach(game => {
      if (!picks[game.id]) return;

      winners[game.index] =
        Number(picks[game.id]) === game.homeId
          ? game.homeId
          : game.awayId;
    });

    pending.forEach((game, j) => {
      const p = probabilities[j];

      const homeWins = exact
        ? Boolean((iteration >> j) & 1)
        : random() < p;

      if (exact) {
        weight *= homeWins ? p : 1 - p;
      }

      winners[game.index] = homeWins
        ? game.homeId
        : game.awayId;
    });

    const state = applyGames(
      teams,
      games,
      winners
    );

    const categories = classify(
      state,
      playoffCount,
      finalScoresKnown && games.length === 0
    );

    const nominal = getPlayoffField(
      state,
      playoffCount
    );

    totalWeight += weight;

    for (const team of teams) {
      const stat = totals.get(team.ownerId);

      const category = categories.get(
        team.ownerId
      );

      stat[category]++;

      if (category !== "out") {
        stat.playoff++;
      }

      if (nominal.has(team.ownerId)) {
        stat.weighted += weight;
      }
    }

    entries.push({
      winners,
      categories,
      weight
    });
  }

  for (const stat of totals.values()) {
    stat.odds =
      stat.weighted / (totalWeight || 1);
  }

  return {
    exact,
    iterations,
    totals,
    entries
  };
}

// =====================================================
// CONDITIONAL PLAYOFF ODDS
// =====================================================

function conditionalOdds(
  model,
  ownerId,
  gameIndex,
  winnerId
) {
  let total = 0;
  let qualified = 0;

  for (const entry of model.entries) {
    if (
      entry.winners[gameIndex] !== winnerId
    ) {
      continue;
    }

    total += entry.weight;

    if (
      entry.categories.get(ownerId) !== "out"
    ) {
      // Possible playoff qualification.
      qualified += entry.weight;
    }
  }

  return {
    probability: total
      ? qualified / total
      : null,
    sampleCount: total
  };
}

function nominalConditionalOdds(
  model,
  ownerId,
  gameIndex,
  winnerId,
  teams,
  games,
  playoffCount
) {
  let total = 0;
  let qualified = 0;

  for (const entry of model.entries) {
    if (
      entry.winners[gameIndex] !== winnerId
    ) {
      continue;
    }

    total += entry.weight;

    const state = applyGames(
      teams,
      games,
      entry.winners
    );

    if (
      getPlayoffField(
        state,
        playoffCount
      ).has(ownerId)
    ) {
      qualified += entry.weight;
    }
  }

  return total
    ? qualified / total
    : null;
}

// =====================================================
// THIS WEEK'S ANALYTICS
// =====================================================

function weeklyReport(
  model,
  ownerId,
  teams,
  games,
  week,
  playoffCount
) {
  if (!ownerId || week == null) return null;

  const weekGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(game => game.week === week);

  const ownGame = weekGames.find(
    game =>
      game.homeId === ownerId ||
      game.awayId === ownerId
  );

  let win = null;
  let loss = null;

  if (ownGame) {
    const opponent =
      ownGame.homeId === ownerId
        ? ownGame.awayId
        : ownGame.homeId;

    win = nominalConditionalOdds(
      model,
      ownerId,
      ownGame.index,
      ownerId,
      teams,
      games,
      playoffCount
    );

    loss = nominalConditionalOdds(
      model,
      ownerId,
      ownGame.index,
      opponent,
      teams,
      games,
      playoffCount
    );
  }

  const qualifying = entry =>
    entry.categories.get(ownerId) !== "out";

  const possibleEntries =
    model.entries.filter(qualifying);

  const gamesToWatch = [];

  for (const game of weekGames) {
    if (
      game.homeId === ownerId ||
      game.awayId === ownerId
    ) {
      continue;
    }

    const homeResult = conditionalOdds(
      model,
      ownerId,
      game.index,
      game.homeId
    );

    const awayResult = conditionalOdds(
      model,
      ownerId,
      game.index,
      game.awayId
    );

    if (
      homeResult.probability === null ||
      awayResult.probability === null
    ) {
      continue;
    }

    const homePaths = possibleEntries.filter(
      e => e.winners[game.index] === game.homeId
    ).length;

    const awayPaths = possibleEntries.filter(
      e => e.winners[game.index] === game.awayId
    ).length;

    const difference =
      homeResult.probability -
      awayResult.probability;

    gamesToWatch.push({
      ...game,
      homePaths,
      awayPaths,
      preferredWinner:
        difference >= 0
          ? game.homeId
          : game.awayId,
      homeOdds: homeResult.probability,
      awayOdds: awayResult.probability,
      impact: Math.abs(difference),
      requiredWinner: model.exact
        ? homePaths === 0 && awayPaths > 0
          ? game.awayId
          : awayPaths === 0 && homePaths > 0
          ? game.homeId
          : null
        : null
    });
  }

  gamesToWatch.sort(
    (a, b) => b.impact - a.impact
  );

  const weeklyIndexes = weekGames.map(
    g => g.index
  );

  const combinations = new Map();

  for (const entry of model.entries) {
    const key = weeklyIndexes
      .map(index => entry.winners[index])
      .join("|");

    if (!combinations.has(key)) {
      combinations.set(key, {
        winners: weeklyIndexes.map(
          index => entry.winners[index]
        ),
        total: 0,
        qualifies: 0,
        count: 0
      });
    }

    const group = combinations.get(key);

    group.total += entry.weight;
    group.count++;

    if (qualifying(entry)) {
      group.qualifies += entry.weight;
    }
  }

  const danger = [...combinations.values()]
    .map(group => ({
      ...group,
      probability:
        group.total
          ? group.qualifies / group.total
          : 0
    }))
    .sort(
      (a, b) =>
        a.probability - b.probability
    );

  const bestCase =
    danger.length
      ? danger[danger.length - 1]
      : null;

  const worstCase =
    danger.length
      ? danger[0]
      : null;

  let headline = "Playoff race remains open";

  if (ownGame && model.exact) {
    const winPaths = possibleEntries.filter(
      e =>
        e.winners[ownGame.index] === ownerId
    ).length;

    const lossPaths = possibleEntries.filter(
      e =>
        e.winners[ownGame.index] !== ownerId
    ).length;

    if (winPaths > 0 && lossPaths === 0) {
      headline = "Must win this week";
    } else if (
      winPaths > 0 &&
      lossPaths > 0
    ) {
      headline = "Can survive a loss";
    } else if (
      winPaths === 0 &&
      lossPaths === 0
    ) {
      headline = "No remaining modeled path";
    }
  }

  return {
    headline,
    ownGame,
    win,
    loss,
    gamesToWatch,
    bestCase,
    worstCase,
    weekGames
  };
}

// =====================================================
// POINTS TIEBREAKERS
// =====================================================

function pointsRequirement(team, rival) {
  const difference = Math.round(
    (
      number(rival.pointsFor) -
      number(team.pointsFor)
    ) * 100
  );

  if (difference >= 0) {
    return (
      `Outscore ${rival.ownerName} by at least ` +
      `${((difference + 1) / 100).toFixed(2)} ` +
      `combined fantasy points over the remaining weeks.`
    );
  }

  return (
    `Currently ahead of ${rival.ownerName} by ` +
    `${(-difference / 100).toFixed(2)} points. ` +
    `Protect that advantage.`
  );
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
  const [submitted, setSubmitted] = useState(null);

  const [ownerSelection, setOwnerSelection] =
    useState("");

  const [finish, setFinish] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedPath, setExpandedPath] =
    useState(null);

  const [openWeeks, setOpenWeeks] = useState({
    [currentWeek]: true
  });

  const [showFullResults, setShowFullResults] =
    useState(false);

  const teamMap = useMemo(
    () => new Map(
      teams.map(t => [t.ownerId, t])
    ),
    [teams]
  );

  const name = id =>
    teamMap.get(id)?.ownerName || "Unknown Owner";

  const weeks = useMemo(
    () =>
      [...new Set(games.map(g => g.week))]
        .sort((a, b) => a - b),
    [games]
  );

  const baseline = useMemo(
    () => runModel({
      teams,
      games,
      playoffCount,
      season
    }),
    [teams, games, playoffCount, season]
  );

  const simulated = useMemo(
    () => submitted === null
      ? null
      : runModel({
          teams,
          games,
          playoffCount,
          picks: submitted,
          season
        }),
    [
      teams,
      games,
      playoffCount,
      submitted,
      season
    ]
  );

  const active = simulated || baseline;

  const finalTwoWeeks =
    currentWeek >=
      REGULAR_SEASON_END_WEEK - 1 &&
    currentWeek <= REGULAR_SEASON_END_WEEK;

  const seasonOver =
    currentWeek > REGULAR_SEASON_END_WEEK;

  const remainingWeek =
    weeks.find(w => w >= currentWeek) ??
    weeks[0] ??
    null;

  const eligibleOwners = teams
    .filter(t => {
      const stat = active.totals.get(
        t.ownerId
      );

      if (!stat) return false;

      if (!active.exact) {
        // Sampled 0% is not proof of elimination.
        return true;
      }

      return (
        stat.playoff > 0 &&
        stat.clinch < active.iterations
      );
    })
    .sort(
      (a, b) =>
        a.ownerName.localeCompare(
          b.ownerName
        )
    );

  const requestedId = Number(ownerSelection);

  const selectedId = eligibleOwners.some(
    t => t.ownerId === requestedId
  )
    ? requestedId
    : eligibleOwners[0]?.ownerId || 0;

  const selectedTeam = teamMap.get(selectedId);

  const selectedStats =
    active.totals.get(selectedId);

  const weekly = useMemo(
    () => weeklyReport(
      active,
      selectedId,
      teams,
      games,
      remainingWeek,
      playoffCount
    ),
    [
      active,
      selectedId,
      teams,
      games,
      remainingWeek,
      playoffCount
    ]
  );

  const ownGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId === selectedId ||
        game.awayId === selectedId
    );

  const qualifyingCombinations =
    finalTwoWeeks &&
    active.exact &&
    selectedTeam
      ? active.entries.filter(entry => {
          if (
            entry.categories.get(selectedId) ===
            "out"
          ) {
            return false;
          }

          if (finish === "all") return true;

          const resultPattern = ownGames
            .map(game =>
              entry.winners[game.index] ===
                selectedId
                ? "W"
                : "L"
            )
            .join("");

          return resultPattern === finish;
        })
      : [];

  const totalPages = Math.max(
    1,
    Math.ceil(
      qualifyingCombinations.length /
      COMBINATIONS_PER_PAGE
    )
  );

  const currentPage = Math.min(
    page,
    totalPages
  );

  const visibleCombinations =
    qualifyingCombinations.slice(
      (currentPage - 1) *
        COMBINATIONS_PER_PAGE,
      currentPage *
        COMBINATIONS_PER_PAGE
    );

  const finishOptions =
    ownGames.length <= 4
      ? Array.from(
          { length: 2 ** ownGames.length },
          (_, mask) =>
            ownGames.map((_, i) =>
              mask & (1 << i) ? "W" : "L"
            ).join("")
        ).sort(
          (a, b) =>
            b.split("W").length -
              a.split("W").length ||
            a.localeCompare(b)
        )
      : [];

  function chooseWinner(game, winnerId) {
    setPicks(old => {
      const next = { ...old };

      if (next[game.id] === winnerId) {
        delete next[game.id];
      } else {
        next[game.id] = winnerId;
      }

      return next;
    });
  }

  function runScenario() {
    setSubmitted({ ...picks });
    setPage(1);
    setExpandedPath(null);
  }

  function resetScenario() {
    setPicks({});
    setSubmitted(null);
    setPage(1);
    setExpandedPath(null);
  }

  function changeOwner(value) {
    setOwnerSelection(value);
    setFinish("all");
    setPage(1);
    setExpandedPath(null);
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="dp-root">

      {/* --------------------------------------------
          1. PLAYOFF PERCENTAGES
      -------------------------------------------- */}

      <section className="dp-panel">
        <span className="dp-kicker">
          DIRTY P ANALYTICS
        </span>

        <h2>Playoff Percentages</h2>

        <p className="dp-muted">
          Estimated playoff chances based on
          records, scoring averages, and
          remaining matchups.
        </p>

        <div className="dp-odds-grid">
          {[...teams]
            .sort(
              (a, b) =>
                baseline.totals.get(b.ownerId).odds -
                baseline.totals.get(a.ownerId).odds
            )
            .map(team => {
              const stat = baseline.totals.get(
                team.ownerId
              );

              return (
                <div
                  className="dp-odds-card"
                  key={team.ownerId}
                >
                  <div className="dp-between">
                    <strong>
                      {team.ownerName}
                    </strong>

                    <strong className="dp-gold">
                      {percent(stat.odds)}
                    </strong>
                  </div>

                  <div className="dp-track">
                    <div style={{
                      width: `${stat.odds * 100}%`
                    }} />
                  </div>

                  <small>
                    {stat.playoff.toLocaleString()}
                    {" / "}
                    {baseline.iterations.toLocaleString()}
                    {" "}
                    outcomes with a possible berth
                  </small>
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          {baseline.exact
            ? `Evaluated all ${baseline.iterations.toLocaleString()} available W/L combinations.`
            : `${SIMULATION_COUNT.toLocaleString()} Monte Carlo simulations.`}
          {" "}Probabilities are estimated,
          not official ESPN odds.
        </p>
      </section>

      {/* --------------------------------------------
          2. THIS WEEK: WHAT YOU NEED
      -------------------------------------------- */}

      <section className="dp-panel">
        <span className="dp-kicker">
          WEEKLY PLAYOFF INTELLIGENCE
        </span>

        <h2>This Week: What You Need</h2>

        <p className="dp-muted">
          Find out how a win or loss changes
          your chances, who to root for,
          and which results could hurt you.
        </p>

        {eligibleOwners.length > 0 ? (
          <>
            <select
              className="dp-select"
              value={selectedId}
              onChange={e =>
                changeOwner(e.target.value)
              }
            >
              {eligibleOwners.map(team => (
                <option
                  key={team.ownerId}
                  value={team.ownerId}
                >
                  {team.ownerName}
                </option>
              ))}
            </select>

            {selectedTeam && weekly && (
              <div className="dp-week-report">
                <div className="dp-between">
                  <div>
                    <span className="dp-kicker">
                      WEEK {remainingWeek}
                    </span>

                    <h3>{selectedTeam.ownerName}</h3>
                  </div>

                  <span className="dp-status">
                    {weekly.headline}
                  </span>
                </div>

                {weekly.ownGame && (
                  <>
                    <p className="dp-muted">
                      Playing{" "}
                      {name(
                        weekly.ownGame.homeId ===
                          selectedId
                          ? weekly.ownGame.awayId
                          : weekly.ownGame.homeId
                      )}
                    </p>

                    <div className="dp-two-grid">
                      <div className="dp-metric">
                        <small>
                          IF YOU WIN
                        </small>

                        <strong style={{
                          color: COLORS.clinch
                        }}>
                          {weekly.win === null
                            ? "—"
                            : percent(weekly.win)}
                        </strong>

                        <span>
                          Projected playoff odds
                        </span>
                      </div>

                      <div className="dp-metric">
                        <small>
                          IF YOU LOSE
                        </small>

                        <strong style={{
                          color: COLORS.out
                        }}>
                          {weekly.loss === null
                            ? "—"
                            : percent(weekly.loss)}
                        </strong>

                        <span>
                          Projected playoff odds
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <h4>Who You Should Root For</h4>

                {weekly.gamesToWatch.length ? (
                  weekly.gamesToWatch.map(game => (
                    <div
                      className="dp-watch"
                      key={game.id}
                    >
                      <div>
                        <strong>
                          {name(game.awayId)}
                          {" vs "}
                          {name(game.homeId)}
                        </strong>

                        <p>
                          Root for:{" "}
                          <b className="dp-gold">
                            {name(
                              game.preferredWinner
                            )}
                          </b>
                        </p>

                        {game.requiredWinner && (
                          <small className="dp-danger">
                            Required winner to preserve
                            at least one modeled path:{" "}
                            {name(game.requiredWinner)}
                          </small>
                        )}
                      </div>

                      <div className="dp-watch-right">
                        <strong>
                          {(
                            game.impact * 100
                          ).toFixed(1)}
                          {" pp"}
                        </strong>

                        <small>
                          Possible-berth odds swing
                        </small>

                        <small>
                          {name(game.homeId)} wins:
                          {" "}{percent(game.homeOdds)}
                        </small>

                        <small>
                          {name(game.awayId)} wins:
                          {" "}{percent(game.awayOdds)}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="dp-muted">
                    No other matchups are available
                    for this week.
                  </p>
                )}

                <h4>
                  What You Cannot Afford
                </h4>

                {weekly.worstCase ? (
                  <div className="dp-situation">
                    <div className="dp-between">
                      <strong>
                        Worst-Case Week
                      </strong>

                      <strong className="dp-danger">
                        {percent(
                          weekly.worstCase.probability
                        )}
                      </strong>
                    </div>

                    <p className="dp-muted">
                      Possible qualification rate
                      across the remaining modeled
                      outcomes if these weekly
                      results occur:
                    </p>

                    {weekly.weekGames.map(
                      (game, index) => {
                        const winner =
                          weekly.worstCase
                            .winners[index];

                        return (
                          <p key={game.id}>
                            {name(winner)}
                            {" "}beats{" "}
                            {name(
                              winner === game.homeId
                                ? game.awayId
                                : game.homeId
                            )}
                          </p>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <p className="dp-muted">
                    No weekly outcome combinations
                    are available.
                  </p>
                )}

                {weekly.bestCase && (
                  <details className="dp-details">
                    <summary>
                      See Best-Case Week
                      {" · "}
                      {percent(
                        weekly.bestCase.probability
                      )}
                    </summary>

                    {weekly.weekGames.map(
                      (game, index) => {
                        const winner =
                          weekly.bestCase
                            .winners[index];

                        return (
                          <p key={game.id}>
                            {name(winner)}
                            {" "}beats{" "}
                            {name(
                              winner === game.homeId
                                ? game.awayId
                                : game.homeId
                            )}
                          </p>
                        );
                      }
                    )}
                  </details>
                )}

                <h4>Points-Scored Watch</h4>

                {teams
                  .filter(t =>
                    t.ownerId !== selectedId
                  )
                  .sort(
                    (a, b) =>
                      Math.abs(
                        a.pointsFor -
                          selectedTeam.pointsFor
                      ) -
                      Math.abs(
                        b.pointsFor -
                          selectedTeam.pointsFor
                      )
                  )
                  .slice(0, 3)
                  .map(rival => (
                    <p
                      className="dp-muted"
                      key={rival.ownerId}
                    >
                      {pointsRequirement(
                        selectedTeam,
                        rival
                      )}
                    </p>
                  ))}

                <p className="dp-muted">
                  Points targets apply only
                  if the teams finish tied
                  on record and total points
                  is the applicable tiebreaker.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="dp-muted">
            No owners have unresolved
            modeled playoff paths.
          </p>
        )}
      </section>

      {/* --------------------------------------------
          3. WHAT-IF SIMULATOR
      -------------------------------------------- */}

      <section className="dp-panel">
        <div className="dp-between">
          <div>
            <span className="dp-kicker">
              INTERACTIVE PLAYOFF MODEL
            </span>

            <h2>What-If Simulator</h2>
          </div>

          <button
            className="dp-secondary"
            onClick={resetScenario}
          >
            Reset
          </button>
        </div>

        <p className="dp-muted">
          Pick winners, then click Run Scenario.
          The weekly report and Road to the
          Playoffs will recalculate too.
        </p>

        {weeks.map(week => (
          <div className="dp-week" key={week}>
            <button
              className="dp-week-toggle"
              onClick={() =>
                setOpenWeeks(old => ({
                  ...old,
                  [week]: !old[week]
                }))
              }
            >
              <strong>Week {week}</strong>

              <span>
                {openWeeks[week] ? "−" : "+"}
              </span>
            </button>

            {openWeeks[week] && (
              <div className="dp-week-games">
                {games
                  .filter(g => g.week === week)
                  .map(game => (
                    <div
                      className="dp-game"
                      key={game.id}
                    >
                      <button
                        className={
                          picks[game.id] ===
                            game.awayId
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          chooseWinner(
                            game,
                            game.awayId
                          )
                        }
                      >
                        {name(game.awayId)}
                      </button>

                      <span>VS</span>

                      <button
                        className={
                          picks[game.id] ===
                            game.homeId
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          chooseWinner(
                            game,
                            game.homeId
                          )
                        }
                      >
                        {name(game.homeId)}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}

        <button
          className="dp-primary"
          onClick={runScenario}
        >
          Run Scenario
        </button>

        {simulated && (
          <div className="dp-results">
            <h3>Scenario Results</h3>

            <p className="dp-muted">
              Change in estimated playoff odds
              compared with the original model.
            </p>

            {[...teams]
              .sort(
                (a, b) =>
                  simulated.totals.get(
                    b.ownerId
                  ).odds -
                  simulated.totals.get(
                    a.ownerId
                  ).odds
              )
              .map(team => {
                const before =
                  baseline.totals.get(
                    team.ownerId
                  ).odds;

                const after =
                  simulated.totals.get(
                    team.ownerId
                  ).odds;

                const change =
                  (after - before) * 100;

                return (
                  <div
                    className="dp-result"
                    key={team.ownerId}
                  >
                    <strong>
                      {team.ownerName}
                    </strong>

                    <span>
                      {percent(before)}
                      {" → "}
                      {percent(after)}
                    </span>

                    <span
                      className={
                        change >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(1)}
                      {" pp"}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* --------------------------------------------
          4. ROAD TO THE PLAYOFFS
      -------------------------------------------- */}

      <section className="dp-panel">
        <span className="dp-kicker">
          POSTSEASON SURVIVAL
        </span>

        <h2>Road to the Playoffs</h2>

        <p className="dp-muted">
          See how many remaining outcomes
          guarantee a berth, keep an owner
          in the hunt, or eliminate them.
          Detailed combinations unlock
          during the final two weeks.
        </p>

        {!active.exact && (
          <p className="dp-warning">
            More than {EXACT_GAME_LIMIT}
            {" "}games are unresolved.
            These are sampled simulation counts,
            not exhaustive mathematical outcomes.
            A zero count does not prove
            elimination.
          </p>
        )}

        {eligibleOwners.length > 0 && (
          <>
            <select
              className="dp-select"
              value={selectedId}
              onChange={e =>
                changeOwner(e.target.value)
              }
            >
              {eligibleOwners.map(team => (
                <option
                  key={team.ownerId}
                  value={team.ownerId}
                >
                  {team.ownerName}
                </option>
              ))}
            </select>

            {selectedTeam && selectedStats && (
              <div className="dp-owner-report">
                <div className="dp-between">
                  <div>
                    <span className="dp-kicker">
                      PLAYOFF SURVIVAL REPORT
                    </span>

                    <h3>
                      {selectedTeam.ownerName}
                    </h3>
                  </div>

                  <span className="dp-status">
                    {active.exact
                      ? "In the Hunt"
                      : "Projected"}
                  </span>
                </div>

                <div className="dp-three-grid">
                  {[
                    {
                      key: "clinch",
                      label: "Clinch Berth"
                    },
                    {
                      key: "hunt",
                      label: "In the Hunt"
                    },
                    {
                      key: "out",
                      label: "Eliminated"
                    }
                  ].map(item => (
                    <div
                      className="dp-scenario-stat"
                      key={item.key}
                    >
                      <strong style={{
                        color: COLORS[item.key]
                      }}>
                        {selectedStats[
                          item.key
                        ].toLocaleString()}
                      </strong>

                      <small>
                        {item.label}
                      </small>
                    </div>
                  ))}
                </div>

                <div className="dp-stacked-bar">
                  {[
                    "clinch",
                    "hunt",
                    "out"
                  ].map(key => (
                    <div
                      key={key}
                      style={{
                        width: `${
                          selectedStats[key] /
                          active.iterations *
                          100
                        }%`,
                        background: COLORS[key]
                      }}
                    />
                  ))}
                </div>

                <p className="dp-muted">
                  Out of{" "}
                  {active.iterations.toLocaleString()}
                  {" "}
                  {active.exact
                    ? "complete win/loss combinations"
                    : "sampled seasons"}.
                  {" "}Categories are mutually
                  exclusive.
                </p>

                {!finalTwoWeeks && !seasonOver && (
                  <div className="dp-locked">
                    <strong>
                      Detailed Playoff Scenarios
                    </strong>

                    <p>
                      Individual qualifying
                      combinations, outside-help
                      requirements, and points
                      tiebreakers unlock during
                      Weeks{" "}
                      {REGULAR_SEASON_END_WEEK - 1}
                      {"–"}
                      {REGULAR_SEASON_END_WEEK}.
                    </p>

                    <p className="dp-muted">
                      Until then, use This Week:
                      What You Need for your
                      weekly playoff outlook.
                    </p>
                  </div>
                )}

                {finalTwoWeeks && (
                  <div className="dp-paths">
                    <h3>
                      Every Qualifying Combination
                    </h3>

                    {!active.exact ? (
                      <p className="dp-warning">
                        Exact combinations are
                        unavailable because more
                        than {EXACT_GAME_LIMIT}
                        {" "}games remain unresolved.
                        The sampled results are
                        not a complete list.
                      </p>
                    ) : (
                      <>
                        <p className="dp-muted">
                          Choose the owner's
                          finishing record.
                          Open each combination
                          to see their games,
                          outside help, and
                          points-tiebreaker targets.
                        </p>

                        <div className="dp-finish-buttons">
                          <button
                            className={
                              finish === "all"
                                ? "active"
                                : ""
                            }
                            onClick={() => {
                              setFinish("all");
                              setPage(1);
                            }}
                          >
                            All Finishes
                          </button>

                          {finishOptions.map(
                            pattern => {
                              const wins =
                                pattern.split("")
                                  .filter(
                                    x => x === "W"
                                  ).length;

                              return (
                                <button
                                  key={pattern}
                                  className={
                                    finish === pattern
                                      ? "active"
                                      : ""
                                  }
                                  onClick={() => {
                                    setFinish(pattern);
                                    setPage(1);
                                  }}
                                >
                                  {wins}-
                                  {pattern.length - wins}
                                  {" "}
                                  ({pattern})
                                </button>
                              );
                            }
                          )}
                        </div>

                        <div className="dp-path-count">
                          <strong>
                            {qualifyingCombinations
                              .length.toLocaleString()}
                          </strong>

                          <span>
                            Qualifying combinations
                            for this finish
                          </span>
                        </div>

                        {visibleCombinations.map(
                          (entry, index) => {
                            const pathNumber =
                              (currentPage - 1) *
                                COMBINATIONS_PER_PAGE +
                              index +
                              1;

                            const key =
                              `${currentPage}-${index}`;

                            return (
                              <PathCard
                                key={key}
                                number={pathNumber}
                                entry={entry}
                                owner={selectedTeam}
                                teams={teams}
                                games={games}
                                playoffCount={
                                  playoffCount
                                }
                                teamMap={teamMap}
                                open={
                                  expandedPath === key
                                }
                                onToggle={() => {
                                  setExpandedPath(
                                    expandedPath === key
                                      ? null
                                      : key
                                  );
                                  setShowFullResults(
                                    false
                                  );
                                }}
                                showFullResults={
                                  showFullResults
                                }
                                setShowFullResults={
                                  setShowFullResults
                                }
                              />
                            );
                          }
                        )}

                        {!qualifyingCombinations
                          .length && (
                          <p className="dp-muted">
                            No qualifying
                            combinations for
                            this finish.
                          </p>
                        )}

                        {totalPages > 1 && (
                          <div className="dp-pagination">
                            <button
                              disabled={
                                currentPage === 1
                              }
                              onClick={() => {
                                setPage(
                                  currentPage - 1
                                );
                                setExpandedPath(null);
                              }}
                            >
                              Previous
                            </button>

                            <span>
                              Page {currentPage}
                              {" / "}
                              {totalPages}
                            </span>

                            <button
                              disabled={
                                currentPage ===
                                totalPages
                              }
                              onClick={() => {
                                setPage(
                                  currentPage + 1
                                );
                                setExpandedPath(null);
                              }}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <p className="dp-muted">
          Model assumptions: division winners
          qualify automatically when exactly
          two divisions exist, followed by
          wild cards. Winning percentage,
          wins, and total points scored
          determine modeled ranking.

          The complete remaining schedule
          and exact league tiebreakers must
          match ESPN before classifications
          can be treated as official.
        </p>
      </section>

      {/* --------------------------------------------
          STYLING
      -------------------------------------------- */}

      <style jsx>{`
        .dp-root {
          display:flex;
          flex-direction:column;
          gap:22px;
          margin:24px 0 44px;
          color:#f4f5f7;
        }

        .dp-panel {
          padding:20px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:13px;
          min-width:0;
        }

        .dp-kicker {
          color:#d7ad63;
          font-size:10px;
          letter-spacing:1.2px;
          font-weight:900;
        }

        h2 {
          color:#fff;
          font-size:23px;
          margin:7px 0 14px;
        }

        h3 {
          color:#e9bd67;
          font-size:18px;
          margin:12px 0;
        }

        h4 {
          color:#e9bd67;
          font-size:14px;
          margin:20px 0 12px;
        }

        .dp-muted {
          color:#a9b6c6;
          font-size:12px;
          line-height:1.7;
        }

        .dp-between {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
        }

        .dp-gold {
          color:#e9bd67;
        }

        .dp-danger {
          color:#e47d83;
        }

        .dp-odds-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
        }

        .dp-odds-card {
          background:#232c38;
          border:1px solid #354050;
          padding:14px;
          border-radius:9px;
        }

        .dp-odds-card small {
          display:block;
          margin-top:10px;
          color:#a9b6c6;
          font-size:10px;
        }

        .dp-track {
          background:#354050;
          height:8px;
          border-radius:99px;
          overflow:hidden;
          margin-top:11px;
        }

        .dp-track div {
          background:#d7ad63;
          height:100%;
          border-radius:99px;
        }

        .dp-select {
          width:100%;
          max-width:460px;
          background:#273240;
          color:#fff;
          padding:13px;
          border:1px solid #806539;
          border-radius:9px;
          margin:12px 0;
        }

        .dp-week-report,
        .dp-owner-report {
          background:#202936;
          padding:17px;
          border:1px solid #354050;
          border-radius:12px;
        }

        .dp-status {
          color:#e9bd67;
          background:#413720;
          border:1px solid #806539;
          border-radius:8px;
          padding:9px 12px;
          font-size:11px;
          font-weight:800;
        }

        .dp-two-grid,
        .dp-three-grid {
          display:grid;
          gap:10px;
          margin:16px 0;
        }

        .dp-two-grid {
          grid-template-columns:repeat(2,minmax(0,1fr));
        }

        .dp-three-grid {
          grid-template-columns:repeat(3,minmax(0,1fr));
        }

        .dp-metric,
        .dp-scenario-stat {
          background:#171d26;
          border:1px solid #354050;
          border-radius:9px;
          padding:14px;
          display:flex;
          flex-direction:column;
          align-items:center;
          text-align:center;
          gap:9px;
        }

        .dp-metric strong,
        .dp-scenario-stat strong {
          font-size:25px;
          font-weight:900;
        }

        .dp-metric small,
        .dp-metric span,
        .dp-scenario-stat small {
          color:#a9b6c6;
          font-size:10px;
        }

        .dp-watch {
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:12px;
          background:#171d26;
          border:1px solid #354050;
          border-radius:9px;
          padding:13px;
          margin:9px 0;
        }

        .dp-watch strong {
          font-size:12px;
        }

        .dp-watch p {
          font-size:12px;
        }

        .dp-watch small {
          display:block;
          font-size:10px;
          color:#a9b6c6;
          margin-top:6px;
        }

        .dp-watch-right {
          text-align:right;
          flex-shrink:0;
        }

        .dp-situation {
          background:#171d26;
          border:1px solid #354050;
          border-radius:9px;
          padding:14px;
          font-size:12px;
        }

        .dp-details {
          background:#171d26;
          border:1px solid #354050;
          border-radius:9px;
          margin:12px 0;
          padding:13px;
          font-size:12px;
        }

        .dp-details summary {
          cursor:pointer;
          color:#e9bd67;
          font-weight:800;
        }

        button {
          cursor:pointer;
        }

        .dp-secondary,
        .dp-finish-buttons button,
        .dp-pagination button {
          background:#293544;
          border:1px solid #806539;
          border-radius:8px;
          color:#e9bd67;
          padding:10px 13px;
          font-size:12px;
          font-weight:800;
        }

        .dp-week {
          background:#222b38;
          border:1px solid #354050;
          border-radius:9px;
          margin:9px 0;
          overflow:hidden;
        }

        .dp-week-toggle {
          background:transparent;
          border:0;
          color:#fff;
          width:100%;
          display:flex;
          justify-content:space-between;
          padding:15px;
        }

        .dp-week-games {
          padding:0 13px 13px;
        }

        .dp-game {
          display:grid;
          grid-template-columns:
            minmax(0,1fr) 25px minmax(0,1fr);
          align-items:center;
          gap:7px;
          padding:8px 0;
          border-top:1px solid #354050;
        }

        .dp-game span {
          text-align:center;
          font-size:10px;
          color:#a9b6c6;
        }

        .dp-game button {
          background:#293544;
          color:#f4f5f7;
          border:1px solid #465568;
          border-radius:8px;
          padding:12px 7px;
          font-size:12px;
          overflow-wrap:anywhere;
        }

        .dp-game button.active {
          border-color:#d7ad63;
          background:#413720;
          color:#e9bd67;
        }

        .dp-primary {
          width:100%;
          background:#d7ad63;
          color:#171d26;
          border:0;
          border-radius:8px;
          padding:14px;
          font-size:13px;
          font-weight:900;
          margin-top:15px;
        }

        .dp-results {
          border-top:1px solid #354050;
          padding-top:14px;
          margin-top:17px;
        }

        .dp-result {
          display:grid;
          grid-template-columns:
            minmax(0,1fr) 120px 75px;
          gap:9px;
          padding:12px 0;
          border-bottom:1px solid #354050;
          font-size:12px;
        }

        .positive {
          color:#66d49c;
        }

        .negative {
          color:#e47d83;
        }

        .dp-stacked-bar {
          display:flex;
          width:100%;
          height:11px;
          overflow:hidden;
          border-radius:99px;
          background:#354050;
          margin:14px 0;
        }

        .dp-stacked-bar div {
          height:100%;
        }

        .dp-locked {
          margin-top:17px;
          padding:16px;
          border:1px solid #806539;
          border-radius:9px;
          background:#302a1f;
        }

        .dp-locked strong {
          color:#e9bd67;
          font-size:14px;
        }

        .dp-locked p {
          font-size:12px;
          line-height:1.7;
        }

        .dp-warning {
          padding:14px;
          background:#352d20;
          border:1px solid #806539;
          border-radius:9px;
          color:#edcd95;
          font-size:12px;
          line-height:1.7;
        }

        .dp-finish-buttons {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin:15px 0;
        }

        .dp-finish-buttons button.active {
          background:#413720;
          border-color:#d7ad63;
        }

        .dp-path-count {
          display:flex;
          align-items:center;
          gap:10px;
          padding:13px 0;
          color:#a9b6c6;
          font-size:12px;
        }

        .dp-path-count strong {
          color:#e9bd67;
          font-size:24px;
        }

        .dp-pagination {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-top:15px;
          font-size:12px;
        }

        .dp-pagination button:disabled {
          opacity:0.35;
          cursor:default;
        }

        @media(max-width:700px) {
          .dp-panel {
            padding:14px;
          }

          .dp-odds-grid {
            grid-template-columns:1fr;
          }

          .dp-watch {
            flex-direction:column;
          }

          .dp-watch-right {
            text-align:left;
          }

          .dp-result {
            grid-template-columns:1fr 1fr;
          }

          .dp-result strong {
            grid-column:1/-1;
          }

          .dp-metric strong,
          .dp-scenario-stat strong {
            font-size:20px;
          }

          .dp-scenario-stat {
            padding:11px 5px;
          }
        }
      `}</style>
    </div>
  );
}

// =====================================================
// EXPANDABLE QUALIFYING COMBINATION
// =====================================================

function PathCard({
  number,
  entry,
  owner,
  teams,
  games,
  playoffCount,
  teamMap,
  open,
  onToggle,
  showFullResults,
  setShowFullResults
}) {
  const id = owner.ownerId;

  const name = ownerId =>
    teamMap.get(ownerId)?.ownerName ||
    "Unknown Owner";

  const state = useMemo(
    () => applyGames(
      teams,
      games,
      entry.winners
    ),
    [teams, games, entry]
  );

  const ownerFinal = state.find(
    t => t.ownerId === id
  );

  const indexed = games.map(
    (game, index) => ({
      ...game,
      index
    })
  );

  const ownGames = indexed.filter(
    g =>
      g.homeId === id ||
      g.awayId === id
  );

  const outsideGames = indexed.filter(
    g =>
      g.homeId !== id &&
      g.awayId !== id
  );

  const relevantGames = outsideGames.filter(
    game => {
      const changed = [...entry.winners];

      changed[game.index] =
        changed[game.index] === game.homeId
          ? game.awayId
          : game.homeId;

      const alternate = classify(
        applyGames(
          teams,
          games,
          changed
        ),
        playoffCount,
        false
      );

      return (
        alternate.get(id) !==
        entry.categories.get(id)
      );
    }
  );

  const shownGames = showFullResults
    ? outsideGames
    : relevantGames;

  const tiedCompetitors = state.filter(
    t =>
      t.ownerId !== id &&
      number(t.wins) ===
        number(ownerFinal.wins) &&
      Math.abs(
        winPct(t) -
        winPct(ownerFinal)
      ) < 0.00000001
  );

  return (
    <div className="path-card">
      <button
        className="path-title"
        onClick={onToggle}
      >
        <span>
          <strong>
            Combination {number}
          </strong>

          <small>
            {entry.categories.get(id) === "clinch"
              ? "Guaranteed berth in modeled outcome"
              : "Possible berth — scoring may matter"}
          </small>
        </span>

        <span>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="path-body">
          <h4>
            What {owner.ownerName} Must Do
          </h4>

          {ownGames.map(game => {
            const winner =
              entry.winners[game.index];

            const opponent =
              game.homeId === id
                ? game.awayId
                : game.homeId;

            return (
              <p key={game.id}>
                Week {game.week}:{" "}
                <b>
                  {winner === id
                    ? "Beat"
                    : "Lose to"}
                  {" "}
                  {name(opponent)}
                </b>
              </p>
            );
          })}

          <h4>
            Outside Games Affecting This Path
          </h4>

          {shownGames.length ? (
            shownGames.map(game => {
              const winner =
                entry.winners[game.index];

              const loser =
                winner === game.homeId
                  ? game.awayId
                  : game.homeId;

              return (
                <p key={game.id}>
                  Week {game.week}:{" "}
                  <b>{name(winner)}</b>
                  {" "}beats{" "}
                  {name(loser)}
                </p>
              );
            })
          ) : (
            <p>
              No individually decisive
              outside game was identified.
            </p>
          )}

          <button
            className="path-secondary"
            onClick={() =>
              setShowFullResults(
                !showFullResults
              )
            }
          >
            {showFullResults
              ? "Hide Non-Decisive Games"
              : "View Every Result in This Combination"}
          </button>

          <h4>
            Total Points Tiebreaker
          </h4>

          {tiedCompetitors.length ? (
            tiedCompetitors.map(rival => (
              <p key={rival.ownerId}>
                {pointsRequirement(
                  owner,
                  rival
                )}
              </p>
            ))
          ) : (
            <p>
              No opponents finish with
              an identical modeled record
              in this combination.
            </p>
          )}

          <p className="path-note">
            Outside games shown by default
            are games whose individual reversal
            changes the qualification category
            for this path.

            Other results may still matter
            together, so the complete
            combination can be expanded.

            Points targets assume total fantasy
            points is the relevant tiebreaker;
            not every tied competitor must
            necessarily be passed.
          </p>
        </div>
      )}

      <style jsx>{`
        .path-card {
          background:#222b38;
          border:1px solid #354050;
          border-radius:9px;
          margin:9px 0;
          overflow:hidden;
        }

        .path-title {
          background:transparent;
          border:0;
          color:#fff;
          width:100%;
          padding:15px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          text-align:left;
          cursor:pointer;
        }

        .path-title small {
          display:block;
          color:#e9bd67;
          font-size:11px;
          margin-top:6px;
        }

        .path-body {
          padding:0 15px 15px;
          border-top:1px solid #354050;
        }

        h4 {
          color:#e9bd67;
          font-size:13px;
          margin:17px 0 9px;
        }

        p {
          color:#dbe3ec;
          font-size:12px;
          line-height:1.7;
          padding:8px 0;
          border-bottom:1px solid #354050;
        }

        .path-secondary {
          background:#293544;
          color:#e9bd67;
          border:1px solid #806539;
          border-radius:8px;
          padding:10px 12px;
          font-weight:800;
          font-size:11px;
          margin-top:10px;
          cursor:pointer;
        }

        .path-note {
          color:#a9b6c6;
          font-size:11px;
        }
      `}</style>
    </div>
  );
}
