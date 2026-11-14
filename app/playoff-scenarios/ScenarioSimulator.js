
"use client";

import { useMemo, useState } from "react";

const MONTE_CARLO_RUNS = 25000;
const EXACT_LIMIT = 16;
const PAGE_SIZE = 8;

const pct = value =>
  `${((value || 0) * 100).toFixed(1)}%`;

const played = team =>
  team.wins + team.losses + team.ties;

const winRate = team =>
  played(team)
    ? (team.wins + team.ties * 0.5) / played(team)
    : 0.5;

const average = team =>
  played(team)
    ? team.pointsFor / played(team)
    : 100;

const divisionId = team =>
  team.divisionId == null || team.divisionId === ""
    ? null
    : String(team.divisionId);

const clone = teams =>
  teams.map(team => ({ ...team }));

const CATEGORY = {
  guaranteed: "Guaranteed Berth",
  potential: "Potential Berth",
  tiebreaker: "Tiebreaker Help",
  eliminated: "Eliminated"
};

const COLORS = {
  guaranteed: "#58c996",
  potential: "#e6b75d",
  tiebreaker: "#80a9ef",
  eliminated: "#e47d83"
};

// ==============================================
// PLAYOFF RULES
// ==============================================

function compareTeams(a, b, target = null, preference = 0) {
  const recordDifference =
    winRate(b) - winRate(a) ||
    b.wins - a.wins;

  if (Math.abs(recordDifference) > 1e-9) {
    return recordDifference;
  }

  // Model the best and worst possible future
  // points tiebreaker for the selected owner.
  if (
    target != null &&
    preference !== 0 &&
    (a.ownerId === target || b.ownerId === target)
  ) {
    return a.ownerId === target
      ? -preference
      : preference;
  }

  return (
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

function playoffField(
  teams,
  slots,
  target = null,
  preference = 0
) {
  const compare = (a, b) =>
    compareTeams(a, b, target, preference);

  const divisions = new Map();

  for (const team of teams) {
    const id = divisionId(team);

    if (id === null) continue;

    if (!divisions.has(id)) {
      divisions.set(id, []);
    }

    divisions.get(id).push(team);
  }

  const useDivisions =
    divisions.size === 2 &&
    teams.every(t => divisionId(t) !== null);

  if (!useDivisions) {
    return new Set(
      [...teams]
        .sort(compare)
        .slice(0, slots)
        .map(t => t.ownerId)
    );
  }

  const leaders = [...divisions.values()]
    .map(group => [...group].sort(compare)[0])
    .sort(compare)
    .slice(0, slots);

  const leaderIds = new Set(
    leaders.map(t => t.ownerId)
  );

  const wildcards = teams
    .filter(t => !leaderIds.has(t.ownerId))
    .sort(compare)
    .slice(0, Math.max(0, slots - leaders.length));

  return new Set(
    [...leaders, ...wildcards].map(t => t.ownerId)
  );
}

// ==============================================
// GAME OUTCOMES
// ==============================================

function applyWinner(lookup, game, winnerId) {
  const home = lookup.get(game.homeId);
  const away = lookup.get(game.awayId);

  if (!home || !away) return;

  if (winnerId === game.homeId) {
    home.wins++;
    away.losses++;
  } else if (winnerId === game.awayId) {
    away.wins++;
    home.losses++;
  }
}

function seasonAfter(teams, games, winners) {
  const state = clone(teams);
  const lookup = new Map(
    state.map(t => [t.ownerId, t])
  );

  games.forEach((game, i) => {
    applyWinner(lookup, game, winners[i]);
  });

  return state;
}

function matchupProbability(a, b) {
  if (!a || !b) return 0.5;

  const strength = team => {
    const weight =
      played(team) / (played(team) + 4);

    const scoring = Math.max(
      -0.15,
      Math.min(
        0.15,
        (average(team) - 100) / 270
      )
    );

    return weight * (
      0.33 * (winRate(team) - 0.5) +
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
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) >>> 0;

    let x = value;

    x = Math.imul(
      x ^ (x >>> 15),
      x | 1
    );

    x ^= x + Math.imul(
      x ^ (x >>> 7),
      x | 61
    );

    return (
      ((x ^ (x >>> 14)) >>> 0) /
      4294967296
    );
  };
}

// ==============================================
// FOUR EXCLUSIVE OUTCOME CATEGORIES
// ==============================================

function classifyOutcome(state, slots) {
  const actual = playoffField(state, slots);

  const categories = new Map();

  for (const team of state) {
    const id = team.ownerId;

    const possible = playoffField(
      state,
      slots,
      id,
      1
    ).has(id);

    // If the regular season has finished,
    // actual points are no longer unknown.
    // This is addressed by the engine below.

    if (!possible) {
      categories.set(id, "eliminated");
      continue;
    }

    const guaranteed = playoffField(
      state,
      slots,
      id,
      -1
    ).has(id);

    if (guaranteed) {
      categories.set(id, "guaranteed");
    } else if (actual.has(id)) {
      categories.set(id, "potential");
    } else {
      categories.set(id, "tiebreaker");
    }
  }

  return categories;
}

// ==============================================
// COMPLETE PREDICTION ENGINE
// ==============================================

function calculateModel(
  teams,
  games,
  slots,
  picks = {},
  season = 2026
) {
  const pending = games
    .map((game, index) => ({ ...game, index }))
    .filter(game => !picks[game.id]);

  const exact = pending.length <= EXACT_LIMIT;

  const iterations = exact
    ? 2 ** pending.length
    : MONTE_CARLO_RUNS;

  const original = new Map(
    teams.map(t => [t.ownerId, t])
  );

  const probabilities = pending.map(game =>
    matchupProbability(
      original.get(game.homeId),
      original.get(game.awayId)
    )
  );

  const random = seededRandom(
    season + 20261113 +
    Object.entries(picks).reduce(
      (sum, [key, value]) =>
        sum + key.length * 13 + Number(value),
      0
    )
  );

  const totals = new Map(
    teams.map(t => [
      t.ownerId,
      {
        guaranteed: 0,
        potential: 0,
        tiebreaker: 0,
        eliminated: 0,
        qualifying: 0,
        weighted: 0
      }
    ])
  );

  const entries = [];

  let totalWeight = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const winners = Array(games.length);
    const bits = Array(games.length);

    let weight = 1;

    games.forEach((game, index) => {
      if (!picks[game.id]) return;

      const homeWins =
        Number(picks[game.id]) === game.homeId;

      winners[index] =
        homeWins ? game.homeId : game.awayId;

      bits[index] = homeWins ? "1" : "0";
    });

    pending.forEach((game, index) => {
      const probability = probabilities[index];

      const homeWins = exact
        ? Boolean((iteration >> index) & 1)
        : random() < probability;

      if (exact) {
        weight *= homeWins
          ? probability
          : 1 - probability;
      }

      winners[game.index] =
        homeWins ? game.homeId : game.awayId;

      bits[game.index] =
        homeWins ? "1" : "0";
    });

    const state = seasonAfter(
      teams,
      games,
      winners
    );

    let categories;

    if (pending.length === 0) {
      const finalField = playoffField(state, slots);

      categories = new Map(
        teams.map(t => [
          t.ownerId,
          finalField.has(t.ownerId)
            ? "guaranteed"
            : "eliminated"
        ])
      );
    } else {
      categories = classifyOutcome(state, slots);
    }

    totalWeight += weight;

    const nominal = playoffField(state, slots);

    for (const team of teams) {
      const id = team.ownerId;
      const category = categories.get(id);
      const result = totals.get(id);

      result[category]++;

      if (category !== "eliminated") {
        result.qualifying++;
      }

      if (nominal.has(id)) {
        result.weighted += weight;
      }
    }

    entries.push({
      bits: bits.join(""),
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

// ==============================================
// SCORING TIEBREAKERS
// ==============================================

function pointsTarget(team, rival) {
  const difference = Math.round(
    (rival.pointsFor - team.pointsFor) * 100
  );

  if (difference >= 0) {
    return (
      `Outscore ${rival.ownerName} by at least ` +
      `${((difference + 1) / 100).toFixed(2)} ` +
      `combined fantasy points over the remaining games.`
    );
  }

  const lead = -difference / 100;

  return (
    `Currently ahead of ${rival.ownerName} ` +
    `by ${lead.toFixed(2)} points. ` +
    `Protect that lead through the end of the season.`
  );
}

function isQualifying(category) {
  return category !== "eliminated";
}

// ==============================================
// THIS WEEK ANALYTICS
// ==============================================

function weeklyAdvice(
  model,
  ownerId,
  games,
  week,
  name
) {
  if (!model || !ownerId) return null;

  const weekGames = games.filter(
    game => game.week === week
  );

  const ownGame = weekGames.find(
    game =>
      game.homeId === ownerId ||
      game.awayId === ownerId
  );

  const qualifying = entry =>
    isQualifying(
      entry.categories.get(ownerId)
    );

  const qualifyingEntries =
    model.entries.filter(qualifying);

  const ownResults = ownGame
    ? {
        win: qualifyingEntries.filter(
          entry =>
            entry.winners[games.indexOf(ownGame)] ===
            ownerId
        ).length,

        loss: qualifyingEntries.filter(
          entry =>
            entry.winners[games.indexOf(ownGame)] !==
            ownerId
        ).length
      }
    : null;

  let headline = "Playoff race still open";

  if (model.exact) {
    if (!qualifyingEntries.length) {
      headline = "No qualifying path in the model";
    } else if (!ownGame) {
      headline = "No matchup available this week";
    } else if (
      ownResults.win > 0 &&
      ownResults.loss === 0
    ) {
      headline = "MUST WIN THIS WEEK";
    } else if (
      ownResults.win > 0 &&
      ownResults.loss > 0
    ) {
      headline = "CAN AFFORD A LOSS";
    } else if (
      ownResults.win === 0 &&
      ownResults.loss > 0
    ) {
      headline = "LOSS REQUIRED FOR A MODELED PATH";
    }
  } else {
    headline = "Projected weekly outlook";
  }

  const outside = [];

  for (const game of weekGames) {
    if (
      game.homeId === ownerId ||
      game.awayId === ownerId
    ) {
      continue;
    }

    const index = games.indexOf(game);

    const homePaths = qualifyingEntries.filter(
      entry =>
        entry.winners[index] === game.homeId
    ).length;

    const awayPaths = qualifyingEntries.filter(
      entry =>
        entry.winners[index] === game.awayId
    ).length;

    if (!homePaths && !awayPaths) continue;

    if (model.exact && homePaths === 0) {
      outside.push({
        text:
          `${name(game.awayId)} must beat ` +
          `${name(game.homeId)}`,
        type: "required",
        game
      });
    } else if (model.exact && awayPaths === 0) {
      outside.push({
        text:
          `${name(game.homeId)} must beat ` +
          `${name(game.awayId)}`,
        type: "required",
        game
      });
    } else {
      // Both results preserve at least one path.
      // Do not incorrectly label one as required.
      outside.push({
        text:
          `${name(game.awayId)} vs ${name(game.homeId)}: ` +
          `either winner leaves a possible path`,
        type: "optional",
        game
      });
    }
  }

  return {
    headline,
    ownGame,
    ownResults,
    outside
  };
}

// ==============================================
// MAIN COMPONENT
// ==============================================

export default function ScenarioSimulator({
  teams = [],
  games = [],
  currentWeek = 1,
  season = 2026,
  playoffCount = 4
}) {
  const [picks, setPicks] = useState({});
  const [submitted, setSubmitted] = useState(null);

  const [selectedOwner, setSelectedOwner] =
    useState("");

  const [finish, setFinish] = useState("all");
  const [category, setCategory] = useState("all");

  const [page, setPage] = useState(1);
  const [openCombination, setOpenCombination] =
    useState(null);

  const [openWeeks, setOpenWeeks] = useState({
    [currentWeek]: true
  });

  const [showAllResults, setShowAllResults] =
    useState(false);

  const ownerMap = useMemo(
    () =>
      new Map(
        teams.map(t => [t.ownerId, t])
      ),
    [teams]
  );

  const name = id =>
    ownerMap.get(id)?.ownerName || "Unknown owner";

  const weeks = useMemo(
    () =>
      [...new Set(games.map(g => g.week))]
        .sort((a, b) => a - b),
    [games]
  );

  const baseline = useMemo(
    () =>
      calculateModel(
        teams,
        games,
        playoffCount,
        {},
        season
      ),
    [teams, games, playoffCount, season]
  );

  const whatIf = useMemo(
    () =>
      submitted === null
        ? null
        : calculateModel(
            teams,
            games,
            playoffCount,
            submitted,
            season
          ),
    [
      teams,
      games,
      playoffCount,
      submitted,
      season
    ]
  );

  const activeModel = whatIf || baseline;

  const eligibleOwners = teams
    .filter(team => {
      if (!activeModel.exact) return true;

      const stat = activeModel.totals.get(
        team.ownerId
      );

      return (
        stat.qualifying > 0 &&
        stat.guaranteed < activeModel.iterations
      );
    })
    .sort(
      (a, b) =>
        a.ownerName.localeCompare(b.ownerName)
    );

  const actualSelectedId = Number(selectedOwner);

  const chosenOwner = eligibleOwners.some(
    t => t.ownerId === actualSelectedId
  )
    ? actualSelectedId
    : eligibleOwners[0]?.ownerId || 0;

  const owner = ownerMap.get(chosenOwner);

  const ownerStats =
    activeModel.totals.get(chosenOwner);

  const currentAvailableWeek =
    weeks.includes(currentWeek)
      ? currentWeek
      : weeks.find(w => w > currentWeek);

  const advice = useMemo(
    () =>
      weeklyAdvice(
        activeModel,
        chosenOwner,
        games,
        currentAvailableWeek,
        name
      ),
    [
      activeModel,
      chosenOwner,
      games,
      currentAvailableWeek,
      ownerMap
    ]
  );

  const ownGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId === chosenOwner ||
        game.awayId === chosenOwner
    );

  const qualifyingEntries = owner
    ? activeModel.entries.filter(entry => {
        const status =
          entry.categories.get(chosenOwner);

        if (
          category !== "all" &&
          status !== category
        ) {
          return false;
        }

        if (
          category === "all" &&
          status === "eliminated"
        ) {
          return false;
        }

        if (finish === "all") {
          return true;
        }

        const pattern = ownGames
          .map(game =>
            entry.winners[game.index] === chosenOwner
              ? "W"
              : "L"
          )
          .join("");

        return pattern === finish;
      })
    : [];

  const totalPages = Math.max(
    1,
    Math.ceil(qualifyingEntries.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visible = qualifyingEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const finishOptions = ownGames.length <= 5
    ? Array.from(
        {
          length: 2 ** ownGames.length
        },
        (_, mask) =>
          ownGames
            .map((_, i) =>
              mask & (1 << i)
                ? "W"
                : "L"
            )
            .join("")
      ).sort(
        (a, b) =>
          b.split("W").length -
            a.split("W").length ||
          a.localeCompare(b)
      )
    : [];

  function chooseWinner(game, id) {
    setPicks(old => {
      const next = { ...old };

      if (next[game.id] === id) {
        delete next[game.id];
      } else {
        next[game.id] = id;
      }

      return next;
    });
  }

  function reset() {
    setPicks({});
    setSubmitted(null);
    setPage(1);
    setOpenCombination(null);
  }

  function chooseOwner(value) {
    setSelectedOwner(value);
    setFinish("all");
    setCategory("all");
    setPage(1);
    setOpenCombination(null);
  }

  function chooseFilter(type, value) {
    if (type === "finish") {
      setFinish(value);
    } else {
      setCategory(value);
    }

    setPage(1);
    setOpenCombination(null);
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="dp-root">

      {/* SECTION 1: PLAYOFF ODDS */}

      <section className="dp-panel">
        <span className="dp-kicker">
          DIRTY P ANALYTICS
        </span>

        <h2>Playoff Percentages</h2>

        <p className="dp-muted">
          Estimated playoff odds using actual
          league records, fantasy scoring,
          and remaining matchups.
        </p>

        <div className="dp-odds-grid">
          {[...teams]
            .sort(
              (a, b) =>
                baseline.totals.get(b.ownerId).odds -
                baseline.totals.get(a.ownerId).odds
            )
            .map(team => {
              const stat =
                baseline.totals.get(team.ownerId);

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
                      {pct(stat.odds)}
                    </strong>
                  </div>

                  <div className="dp-track">
                    <div
                      style={{
                        width: `${stat.odds * 100}%`
                      }}
                    />
                  </div>

                  <small>
                    {stat.qualifying.toLocaleString()}
                    {" / "}
                    {baseline.iterations.toLocaleString()}
                    {" "}
                    possible qualifying{" "}
                    {baseline.exact
                      ? "combinations"
                      : "simulations"}
                  </small>

                  {baseline.exact && (
                    <small>
                      {stat.qualifying === 0
                        ? "No modeled playoff path"
                        : stat.guaranteed ===
                          baseline.iterations
                        ? "Clinched in modeled outcomes"
                        : "Still in the race"}
                    </small>
                  )}
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          {baseline.exact
            ? `All ${baseline.iterations.toLocaleString()} remaining win/loss combinations evaluated.`
            : `${MONTE_CARLO_RUNS.toLocaleString()} Monte Carlo simulations.`}
          {" "}Percentages are probability
          estimates, not official ESPN odds.
        </p>
      </section>

      {/* SECTION 2: THIS WEEK */}

      <section className="dp-panel">
        <span className="dp-kicker">
          WEEKLY PLAYOFF SURVIVAL
        </span>

        <h2>
          This Week: What You Need
        </h2>

        <p className="dp-muted">
          A quick look at what an owner needs
          to do and which other games matter.
          Select an owner to get their report.
        </p>

        {eligibleOwners.length > 0 ? (
          <>
            <select
              className="dp-select"
              value={chosenOwner}
              onChange={e =>
                chooseOwner(e.target.value)
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

            {owner && advice && (
              <div className="dp-week-report">
                <div className="dp-between">
                  <div>
                    <span className="dp-kicker">
                      {currentAvailableWeek
                        ? `WEEK ${currentAvailableWeek}`
                        : "CURRENT OUTLOOK"}
                    </span>

                    <h3>{owner.ownerName}</h3>
                  </div>

                  <span className="dp-status">
                    {advice.headline}
                  </span>
                </div>

                {advice.ownGame ? (
                  <div className="dp-important">
                    <strong>
                      Your Matchup
                    </strong>

                    <p>
                      {owner.ownerName} vs{" "}
                      {name(
                        advice.ownGame.homeId ===
                          chosenOwner
                          ? advice.ownGame.awayId
                          : advice.ownGame.homeId
                      )}
                    </p>

                    {activeModel.exact && (
                      <>
                        <p>
                          Win:{" "}
                          <b>
                            {advice.ownResults.win.toLocaleString()}
                          </b>
                          {" "}qualifying combinations
                        </p>

                        <p>
                          Loss:{" "}
                          <b>
                            {advice.ownResults.loss.toLocaleString()}
                          </b>
                          {" "}qualifying combinations
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="dp-muted">
                    No upcoming matchup was
                    supplied for this owner.
                  </p>
                )}

                <h4>
                  Other Games to Watch
                </h4>

                {advice.outside.filter(
                  item => item.type === "required"
                ).length > 0 ? (
                  advice.outside
                    .filter(item =>
                      item.type === "required"
                    )
                    .map(item => (
                      <div
                        className="dp-requirement"
                        key={item.game.id}
                      >
                        <strong>
                          {item.text}
                        </strong>

                        <small>
                          Required to preserve a
                          qualifying path in the model
                        </small>
                      </div>
                    ))
                ) : (
                  <p className="dp-muted">
                    No single outside matchup
                    has a mandatory winner
                    under the available paths.
                  </p>
                )}

                {advice.outside.some(
                  item => item.type === "optional"
                ) && (
                  <details className="dp-details">
                    <summary>
                      Other relevant games
                    </summary>

                    {advice.outside
                      .filter(item =>
                        item.type === "optional"
                      )
                      .map(item => (
                        <p key={item.game.id}>
                          {item.text}
                        </p>
                      ))}
                  </details>
                )}

                <p className="dp-muted">
                  This week's requirements
                  automatically reflect the
                  current modeled playoff paths.
                  When you run a What-If scenario,
                  this report recalculates.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="dp-muted">
            No unresolved modeled playoff
            berths are available.
          </p>
        )}
      </section>

      {/* SECTION 3: WHAT-IF */}

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
            onClick={reset}
          >
            Reset
          </button>
        </div>

        <p className="dp-muted">
          Choose winners and click Run Scenario.
          Your choices will recalculate the
          playoff odds and survival reports.
        </p>

        {weeks.map(week => (
          <div
            className="dp-week"
            key={week}
          >
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
                  .filter(game =>
                    game.week === week
                  )
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
          onClick={() => {
            setSubmitted({ ...picks });
            setPage(1);
            setOpenCombination(null);
          }}
        >
          Run Scenario
        </button>

        {whatIf && (
          <div className="dp-results">
            <h3>Scenario Results</h3>

            <p className="dp-muted">
              Playoff probabilities compared
              with the original projection.
            </p>

            {[...teams]
              .sort(
                (a, b) =>
                  whatIf.totals.get(b.ownerId).odds -
                  whatIf.totals.get(a.ownerId).odds
              )
              .map(team => {
                const oldOdds =
                  baseline.totals.get(
                    team.ownerId
                  ).odds;

                const stat =
                  whatIf.totals.get(
                    team.ownerId
                  );

                const change =
                  (stat.odds - oldOdds) * 100;

                return (
                  <div
                    className="dp-result-row"
                    key={team.ownerId}
                  >
                    <strong>
                      {team.ownerName}
                    </strong>

                    <span>
                      {pct(oldOdds)} →{" "}
                      <b>{pct(stat.odds)}</b>
                    </span>

                    <span
                      className={
                        change > 0.05
                          ? "positive"
                          : change < -0.05
                          ? "negative"
                          : ""
                      }
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(1)} pp
                    </span>

                    <small>
                      {stat.qualifying.toLocaleString()}
                      {" / "}
                      {whatIf.iterations.toLocaleString()}
                      {" "}
                      qualifying{" "}
                      {whatIf.exact
                        ? "combinations"
                        : "simulations"}
                    </small>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* SECTION 4: ROAD TO PLAYOFFS */}

      <section className="dp-panel">
        <span className="dp-kicker">
          PLAYOFF SURVIVAL ANALYTICS
        </span>

        <h2>Road to the Playoffs</h2>

        <p className="dp-muted">
          Explore every remaining qualifying
          combination for an owner. See what
          they must do, who else must win,
          and the points tiebreakers that
          could determine their fate.
        </p>

        {!activeModel.exact && (
          <p className="dp-warning">
            More than {EXACT_LIMIT} games remain
            unresolved. The outcomes shown are
            sampled simulations, not every
            mathematical possibility. Owners
            cannot be officially classified
            as eliminated from this sample.
          </p>
        )}

        {eligibleOwners.length > 0 && owner && (
          <>
            <select
              className="dp-select"
              value={chosenOwner}
              onChange={e =>
                chooseOwner(e.target.value)
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

            <div className="dp-owner-overview">
              <div className="dp-between">
                <div>
                  <span className="dp-kicker">
                    PLAYOFF SURVIVAL REPORT
                  </span>

                  <h3>{owner.ownerName}</h3>
                </div>

                <span className="dp-status">
                  {activeModel.exact
                    ? "Still Alive"
                    : "Projected"}
                </span>
              </div>

              <div className="dp-category-grid">
                {[
                  "guaranteed",
                  "potential",
                  "tiebreaker",
                  "eliminated"
                ].map(key => (
                  <button
                    key={key}
                    className={
                      "dp-category " +
                      (category === key
                        ? "selected"
                        : "")
                    }
                    onClick={() =>
                      chooseFilter(
                        "category",
                        category === key
                          ? "all"
                          : key
                      )
                    }
                  >
                    <strong
                      style={{
                        color: COLORS[key]
                      }}
                    >
                      {ownerStats[key].toLocaleString()}
                    </strong>

                    <span>
                      {CATEGORY[key]}
                    </span>
                  </button>
                ))}
              </div>

              <p className="dp-muted">
                {activeModel.iterations.toLocaleString()}
                {" "}
                {activeModel.exact
                  ? "remaining win/loss combinations"
                  : "sampled seasons"}.
                {" "}Each outcome is classified
                into exactly one category.
              </p>
            </div>

            <h3>Choose a Final Record Scenario</h3>

            <div className="dp-finish-options">
              <button
                className={
                  finish === "all"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  chooseFilter(
                    "finish",
                    "all"
                  )
                }
              >
                All Finishes
              </button>

              {finishOptions.map(pattern => {
                const wins = pattern
                  .split("")
                  .filter(x => x === "W")
                  .length;

                const label = pattern.length
                  ? `${wins}-${pattern.length - wins} (${pattern})`
                  : "No Games";

                return (
                  <button
                    key={pattern}
                    className={
                      finish === pattern
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      chooseFilter(
                        "finish",
                        pattern
                      )
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="dp-path-count">
              <strong>
                {qualifyingEntries.length.toLocaleString()}
              </strong>

              <span>
                {category === "eliminated"
                  ? "Eliminated outcomes"
                  : "Qualifying combinations"}
                {" "}matching your filters
              </span>
            </div>

            {visible.map((entry, index) => {
              const key =
                `${currentPage}-${index}-${entry.bits}`;

              return (
                <PathCombination
                  key={key}
                  entry={entry}
                  number={
                    (currentPage - 1) *
                      PAGE_SIZE +
                    index +
                    1
                  }
                  open={
                    openCombination === key
                  }
                  onToggle={() => {
                    setOpenCombination(
                      openCombination === key
                        ? null
                        : key
                    );
                    setShowAllResults(false);
                  }}
                  owner={owner}
                  games={games}
                  teams={teams}
                  playoffCount={playoffCount}
                  byId={ownerMap}
                  showAllResults={showAllResults}
                  setShowAllResults={
                    setShowAllResults
                  }
                />
              );
            })}

            {qualifyingEntries.length === 0 && (
              <p className="dp-muted">
                No outcomes match these filters.
              </p>
            )}

            {totalPages > 1 && (
              <div className="dp-pagination">
                <button
                  disabled={currentPage === 1}
                  onClick={() => {
                    setPage(p => p - 1);
                    setOpenCombination(null);
                  }}
                >
                  Previous
                </button>

                <span>
                  Page {currentPage} of{" "}
                  {totalPages}
                </span>

                <button
                  disabled={
                    currentPage === totalPages
                  }
                  onClick={() => {
                    setPage(p => p + 1);
                    setOpenCombination(null);
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        <p className="dp-muted">
          Exact outcomes use only the remaining
          matchups supplied by your league data.
          The model assumes division winners
          qualify automatically when exactly
          two divisions exist, followed by
          wild cards. Record and total points
          are the modeled tiebreakers.

          Confirm these match the actual
          ESPN league settings before treating
          any result as an official clinch
          or elimination.
        </p>
      </section>

      <style jsx>{`
        .dp-root {
          display:flex;
          flex-direction:column;
          gap:22px;
          margin:24px 0 44px;
          color:#f3f5f8;
        }

        .dp-panel {
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
          padding:20px;
          min-width:0;
        }

        .dp-kicker {
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:1.2px;
        }

        .dp-panel h2 {
          font-size:23px;
          margin:7px 0 14px;
          color:#fff;
        }

        .dp-panel h3 {
          font-size:18px;
          color:#e9bd67;
          margin:14px 0;
        }

        .dp-panel h4 {
          font-size:13px;
          color:#e9bd67;
          margin:16px 0 8px;
        }

        .dp-muted {
          font-size:12px;
          color:#a8b6c6;
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

        .dp-odds-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:10px;
          margin:15px 0;
        }

        .dp-odds-card {
          padding:14px;
          background:#232c38;
          border:1px solid #354050;
          border-radius:10px;
        }

        .dp-odds-card small {
          display:block;
          color:#a8b6c6;
          font-size:10px;
          margin-top:8px;
        }

        .dp-track {
          background:#394656;
          height:8px;
          border-radius:20px;
          overflow:hidden;
          margin-top:10px;
        }

        .dp-track div {
          background:#d7ad63;
          height:100%;
          border-radius:20px;
        }

        button {
          cursor:pointer;
        }

        .dp-select {
          width:100%;
          max-width:520px;
          padding:13px;
          background:#283443;
          color:#fff;
          border:1px solid #806539;
          border-radius:9px;
          margin:12px 0;
        }

        .dp-week-report {
          background:#202936;
          border:1px solid #3b4859;
          border-radius:12px;
          padding:17px;
          margin-top:10px;
        }

        .dp-status {
          background:#403620;
          color:#e9bd67;
          border:1px solid #806539;
          border-radius:8px;
          font-size:11px;
          font-weight:900;
          padding:9px 12px;
        }

        .dp-important {
          background:#19212c;
          border:1px solid #354050;
          padding:14px;
          border-radius:9px;
          margin-top:16px;
          font-size:12px;
        }

        .dp-important p {
          margin:10px 0;
        }

        .dp-requirement {
          border-bottom:1px solid #354050;
          padding:12px 0;
        }

        .dp-requirement strong {
          display:block;
          font-size:12px;
        }

        .dp-requirement small {
          display:block;
          color:#a8b6c6;
          font-size:10px;
          margin-top:6px;
        }

        .dp-details {
          border:1px solid #354050;
          border-radius:8px;
          padding:13px;
          margin:12px 0;
          font-size:12px;
        }

        .dp-details summary {
          cursor:pointer;
          color:#e9bd67;
          font-weight:800;
        }

        .dp-secondary {
          background:#293441;
          color:#e9bd67;
          border:1px solid #806539;
          border-radius:8px;
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
          display:flex;
          justify-content:space-between;
          width:100%;
          background:transparent;
          border:0;
          color:#fff;
          padding:15px;
        }

        .dp-week-games {
          padding:0 13px 13px;
        }

        .dp-game {
          display:grid;
          grid-template-columns:
            minmax(0,1fr) 24px minmax(0,1fr);
          align-items:center;
          gap:8px;
          padding:8px 0;
          border-top:1px solid #354050;
        }

        .dp-game span {
          text-align:center;
          color:#a8b6c6;
          font-size:10px;
        }

        .dp-game button {
          background:#293544;
          color:#edf1f5;
          border:1px solid #465568;
          border-radius:8px;
          padding:12px 7px;
          font-size:12px;
          overflow-wrap:anywhere;
        }

        .dp-game button.active {
          background:#413720;
          color:#f1c775;
          border-color:#d7ad63;
        }

        .dp-primary {
          display:block;
          width:100%;
          margin-top:16px;
          background:#d7ad63;
          color:#171d26;
          border:0;
          border-radius:8px;
          padding:13px;
          font-size:13px;
          font-weight:900;
        }

        .dp-results {
          margin-top:18px;
          border-top:1px solid #354050;
          padding-top:12px;
        }

        .dp-result-row {
          display:grid;
          grid-template-columns:
            minmax(0,1fr) 150px 80px;
          gap:9px;
          padding:12px 0;
          border-bottom:1px solid #354050;
          font-size:12px;
        }

        .dp-result-row small {
          grid-column:1/-1;
          color:#a8b6c6;
        }

        .positive {
          color:#72d3a1;
        }

        .negative {
          color:#ef858d;
        }

        .dp-warning {
          background:#352e20;
          border:1px solid #806539;
          color:#f1d09a;
          border-radius:9px;
          padding:14px;
          font-size:12px;
          line-height:1.7;
        }

        .dp-owner-overview {
          background:#202936;
          border:1px solid #354050;
          border-radius:12px;
          padding:17px;
          margin:15px 0;
        }

        .dp-category-grid {
          display:grid;
          grid-template-columns:
            repeat(4,minmax(0,1fr));
          gap:8px;
          margin-top:17px;
        }

        .dp-category {
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:9px;
          padding:15px 6px;
          background:#171d26;
          border:1px solid #354050;
          border-radius:9px;
          color:#fff;
        }

        .dp-category.selected {
          border-color:#e9bd67;
        }

        .dp-category strong {
          font-size:24px;
        }

        .dp-category span {
          font-size:10px;
          color:#a8b6c6;
          text-align:center;
        }

        .dp-finish-options {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }

        .dp-finish-options button {
          background:#293544;
          color:#fff;
          border:1px solid #465568;
          border-radius:8px;
          padding:11px 13px;
          font-size:12px;
        }

        .dp-finish-options button.active {
          border-color:#d7ad63;
          background:#413720;
          color:#f1c775;
        }

        .dp-path-count {
          display:flex;
          align-items:center;
          gap:11px;
          margin:18px 0;
          color:#a8b6c6;
          font-size:12px;
        }

        .dp-path-count strong {
          color:#e9bd67;
          font-size:25px;
        }

        .dp-pagination {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin:16px 0;
          font-size:12px;
        }

        .dp-pagination button {
          background:#293544;
          border:1px solid #806539;
          border-radius:8px;
          color:#e9bd67;
          padding:10px 13px;
        }

        .dp-pagination button:disabled {
          opacity:.35;
        }

        @media(max-width:700px) {
          .dp-odds-grid {
            grid-template-columns:1fr;
          }

          .dp-category-grid {
            grid-template-columns:
              repeat(2,minmax(0,1fr));
          }

          .dp-panel {
            padding:14px;
          }

          .dp-result-row {
            grid-template-columns:1fr 1fr;
          }

          .dp-result-row strong {
            grid-column:1/-1;
          }
        }
      `}</style>
    </div>
  );
}

// ==============================================
// INDIVIDUAL QUALIFYING COMBINATION
// ==============================================

function PathCombination({
  entry,
  number,
  open,
  onToggle,
  owner,
  games,
  teams,
  playoffCount,
  byId,
  showAllResults,
  setShowAllResults
}) {
  const id = owner.ownerId;

  const status =
    entry.categories.get(id);

  const state = useMemo(
    () =>
      seasonAfter(
        teams,
        games,
        entry.winners
      ),
    [teams, games, entry]
  );

  const ownerFinal = state.find(
    t => t.ownerId === id
  );

  const own = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId === id ||
        game.awayId === id
    );

  const outside = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId !== id &&
        game.awayId !== id
    );

  const important = outside.filter(game => {
    const changed = [...entry.winners];

    changed[game.index] =
      changed[game.index] === game.homeId
        ? game.awayId
        : game.homeId;

    const alternateState = seasonAfter(
      teams,
      games,
      changed
    );

    const alternateCategories =
      classifyOutcome(
        alternateState,
        playoffCount
      );

    return (
      alternateCategories.get(id) !== status
    );
  });

  const displayedOutside =
    showAllResults
      ? outside
      : important;

  const tiedOpponents = state.filter(
    t =>
      t.ownerId !== id &&
      t.wins === ownerFinal.wins &&
      winRate(t) === winRate(ownerFinal)
  );

  const name = ownerId =>
    byId.get(ownerId)?.ownerName ||
    "Unknown Owner";

  return (
    <div className="path-card">
      <button
        className="path-heading"
        onClick={onToggle}
      >
        <span>
          <strong>
            Combination {number}
          </strong>

          <small>
            {CATEGORY[status]}
          </small>
        </span>

        <span>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="path-body">
          <h4>
            What {owner.ownerName} Does
          </h4>

          {own.map(game => {
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

          <h4>Outside Help</h4>

          {displayedOutside.length ? (
            displayedOutside.map(game => {
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
              No individually decisive outside
              results are identified for this
              combination.
            </p>
          )}

          <button
            className="path-secondary"
            onClick={() =>
              setShowAllResults(!showAllResults)
            }
          >
            {showAllResults
              ? "Hide Other Results"
              : "Show Every Other Matchup"}
          </button>

          <h4>
            Total Points Tiebreaker
          </h4>

          {tiedOpponents.length ? (
            tiedOpponents.map(rival => (
              <p key={rival.ownerId}>
                {pointsTarget(owner, rival)}
              </p>
            ))
          ) : (
            <p>
              No competing owners share
              the same final record in
              this combination.
            </p>
          )}

          <p className="path-caution">
            These points targets describe
            pairwise tiebreakers. An owner
            may not need to pass every tied
            competitor to qualify.

            Outside games shown by default
            are those whose individual
            reversal changes the modeled
            outcome category. Multiple
            outside results can also work
            together, so expand all results
            to inspect the full combination.
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

        .path-heading {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          width:100%;
          background:transparent;
          border:0;
          color:#fff;
          text-align:left;
          padding:15px;
          cursor:pointer;
        }

        .path-heading small {
          display:block;
          color:#e9bd67;
          font-size:11px;
          margin-top:6px;
        }

        .path-body {
          padding:0 15px 15px;
          border-top:1px solid #354050;
          color:#dce4eb;
        }

        .path-body h4 {
          font-size:13px;
          color:#e9bd67;
          margin:17px 0 9px;
        }

        .path-body p {
          font-size:12px;
          line-height:1.7;
          padding:8px 0;
          border-bottom:1px solid #354050;
        }

        .path-secondary {
          background:#293544;
          border:1px solid #806539;
          border-radius:8px;
          color:#e9bd67;
          padding:10px 12px;
          font-size:11px;
          font-weight:800;
          cursor:pointer;
          margin-top:9px;
        }

        .path-caution {
          color:#e7c98e;
        }
      `}</style>
    </div>
  );
}
