
"use client";

import { useMemo, useState } from "react";
import TiebreakerPanel from "./TiebreakerPanel";

// DIRTY P PLAYOFF PREDICTOR

const REGULAR_SEASON_END_WEEK = 13;
// Show extended playoff paths from Rivalry Week onward.
const EXTENDED_SCENARIOS_START_WEEK = 11;
const EXACT_GAME_LIMIT = 14;
const SIMULATIONS = 25000;
const PAGE_SIZE = 8;

// Below 3% = Long Shot
const LONG_SHOT_CUTOFF = 0.03;
// Ignore negligible differences when suggesting who to root for.
const NEGLIGIBLE_SWING = 0.01;
const SMALL_SWING = 0.03;

const n = v => Number(v) || 0;

const rate = t => {
  const played =
    n(t.wins) + n(t.losses) + n(t.ties);

  return played
    ? (n(t.wins) + n(t.ties) / 2) / played
    : 0.5;
};

const pct = x =>
  `${(100 * (x || 0)).toFixed(1)}%`;

// Anchor estimated outcomes to ESPN’s published current playoff probability.
// ESPN does not publish a conditional win/loss forecast, so those remain estimates.
function anchoredOdds(estimate, modeledBaseline, espnBaseline) {
  if (estimate == null) return null;
  if (espnBaseline == null || !Number.isFinite(Number(espnBaseline))) return estimate;
  if (estimate <= 0) return 0;
  if (estimate >= 1) return 1;
  const clamp = p => Math.max(0.0001, Math.min(0.9999, Number(p)));
  const logit = p => Math.log(clamp(p) / (1 - clamp(p)));
  const offset = logit(espnBaseline) - logit(modeledBaseline);
  const z = logit(estimate) + offset;
  return 1 / (1 + Math.exp(-z));
}

const qualified = kind =>
  kind !== "out";

const label = kind =>
  kind === "clinch"
    ? "Berth guaranteed in this outcome"
    : kind === "hunt"
    ? "Possible berth — tiebreaker dependent"
    : "Eliminated in this outcome";

// ==================================================
// PLAYOFF QUALIFICATION
// ==================================================

function field(
  teams,
  count,
  target = null,
  favorable = 0
) {
  const compare = (a, b) => {
    const records =
      rate(b) - rate(a) ||
      n(b.wins) - n(a.wins);

    if (Math.abs(records) > 1e-9) {
      return records;
    }

    if (
      target != null &&
      favorable &&
      (
        a.ownerId === target ||
        b.ownerId === target
      )
    ) {
      return a.ownerId === target
        ? -favorable
        : favorable;
    }

    return (
      n(b.pointsFor) - n(a.pointsFor) ||
      String(a.ownerName).localeCompare(
        String(b.ownerName)
      )
    );
  };

  const divisions = new Map();

  teams.forEach(t => {
    if (
      t.divisionId == null ||
      t.divisionId === ""
    ) {
      return;
    }

    const key = String(t.divisionId);

    if (!divisions.has(key)) {
      divisions.set(key, []);
    }

    divisions.get(key).push(t);
  });

  if (
    divisions.size !== 2 ||
    teams.some(
      t =>
        t.divisionId == null ||
        t.divisionId === ""
    )
  ) {
    return new Set(
      [...teams]
        .sort(compare)
        .slice(0, count)
        .map(t => t.ownerId)
    );
  }

  const champions = [
    ...divisions.values()
  ]
    .map(
      group =>
        [...group].sort(compare)[0]
    )
    .sort(compare)
    .slice(0, count);

  const chosen = new Set(
    champions.map(t => t.ownerId)
  );

  const wildcards = [...teams]
    .filter(
      t => !chosen.has(t.ownerId)
    )
    .sort(compare)
    .slice(
      0,
      Math.max(
        0,
        count - champions.length
      )
    );

  return new Set(
    [...champions, ...wildcards].map(
      t => t.ownerId
    )
  );
}

// ==================================================
// SCENARIO CLASSIFICATION
// ==================================================

function classify(
  state,
  slots,
  hasUnknownScoring = true
) {
  const nominal = field(state, slots);
  const kinds = new Map();

  for (const t of state) {
    const id = t.ownerId;

    if (!hasUnknownScoring) {
      kinds.set(
        id,
        nominal.has(id)
          ? "clinch"
          : "out"
      );
    } else if (
      !field(state, slots, id, 1).has(id)
    ) {
      kinds.set(id, "out");
    } else if (
      field(state, slots, id, -1).has(id)
    ) {
      kinds.set(id, "clinch");
    } else {
      kinds.set(id, "hunt");
    }
  }

  return {
    kinds,
    nominal
  };
}

// ==================================================
// APPLY GAME RESULTS
// ==================================================

function apply(
  teams,
  games,
  winners
) {
  const state = teams.map(
    t => ({ ...t })
  );

  const map = new Map(
    state.map(
      t => [t.ownerId, t]
    )
  );

  games.forEach((g, i) => {
    const home = map.get(g.homeId);
    const away = map.get(g.awayId);

    if (!home || !away) return;

    if (winners[i] === g.homeId) {
      home.wins = n(home.wins) + 1;
      away.losses = n(away.losses) + 1;
    } else {
      away.wins = n(away.wins) + 1;
      home.losses = n(home.losses) + 1;
    }
  });

  return state;
}

// ==================================================
// MATCHUP STRENGTH
// ==================================================

function chance(a, b) {
  if (!a || !b) return 0.5;

  const strength = t => {
    const played =
      n(t.wins) + n(t.losses) + n(t.ties);

    const scoring = played
      ? n(t.pointsFor) / played
      : 100;

    return (
      played / (played + 4)
    ) * (
      0.33 * (rate(t) - 0.5) +
      Math.max(
        -0.15,
        Math.min(
          0.15,
          (scoring - 100) / 270
        )
      )
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

function randomGenerator(seed) {
  let s = seed >>> 0;

  return () => {
    s = (s + 0x6d2b79f5) >>> 0;

    let x = s;

    x = Math.imul(
      x ^ x >>> 15,
      x | 1
    );

    x ^= x + Math.imul(
      x ^ x >>> 7,
      x | 61
    );

    return (
      ((x ^ x >>> 14) >>> 0) /
      4294967296
    );
  };
}

// ==================================================
// PLAYOFF SIMULATION ENGINE
// ==================================================

function model(
  teams,
  games,
  slots,
  season
) {
  const exact =
    games.length <= EXACT_GAME_LIMIT;

  const iterations = exact
    ? 2 ** games.length
    : SIMULATIONS;

  const random = randomGenerator(
    93287 + n(season)
  );

  const byId = new Map(
    teams.map(
      t => [t.ownerId, t]
    )
  );

  const probabilities = games.map(
    g =>
      chance(
        byId.get(g.homeId),
        byId.get(g.awayId)
      )
  );

  const totals = new Map(
    teams.map(t => [
      t.ownerId,
      {
        clinch: 0,
        hunt: 0,
        out: 0,
        nominal: 0,
        possible: 0
      }
    ])
  );

  const entries = [];
  let totalWeight = 0;

  for (
    let run = 0;
    run < iterations;
    run++
  ) {
    const winners = [];
    let weight = 1;

    for (
      let j = 0;
      j < games.length;
      j++
    ) {
      const homeWins = exact
        ? Boolean(run & (1 << j))
        : random() < probabilities[j];

      winners.push(
        homeWins
          ? games[j].homeId
          : games[j].awayId
      );

      if (exact) {
        weight *= homeWins
          ? probabilities[j]
          : 1 - probabilities[j];
      }
    }

    const result = classify(
      apply(teams, games, winners),
      slots,
      games.length > 0
    );

    totalWeight += weight;

    for (const t of teams) {
      const id = t.ownerId;
      const stats = totals.get(id);
      const kind = result.kinds.get(id);

      stats[kind]++;

      if (qualified(kind)) {
        stats.possible++;
      }

      if (result.nominal.has(id)) {
        stats.nominal += weight;
      }
    }

    entries.push({
      winners,
      kinds: result.kinds,
      nominal: result.nominal,
      weight
    });
  }

  for (const s of totals.values()) {
    s.odds = totalWeight
      ? s.nominal / totalWeight
      : 0;
  }

  return {
    exact,
    iterations,
    entries,
    totals
  };
}

// ==================================================
// CONDITIONAL PLAYOFF ODDS
// ==================================================

function conditional(
  entries,
  index,
  winner,
  ownerId
) {
  let numerator = 0;
  let denominator = 0;

  for (const e of entries) {
    if (
      e.winners[index] !== winner
    ) {
      continue;
    }

    denominator += e.weight;

    if (e.nominal.has(ownerId)) {
      numerator += e.weight;
    }
  }

  return denominator
    ? numerator / denominator
    : null;
}

// ==================================================
// THIS WEEK: WHAT YOU NEED
// ==================================================

function ownerReport(
  ownerId,
  teams,
  games,
  baseline,
  week,
  espnBaseline = null
) {
  const modeledBaseline = baseline.totals.get(ownerId)?.odds ?? 0;
  const calibrate = p => anchoredOdds(p, modeledBaseline, espnBaseline);
  const relevant = games
    .map(
      (game, index) => ({
        ...game,
        index
      })
    )
    .filter(
      g => g.week === week
    );

  const own = relevant.find(
    g =>
      g.homeId === ownerId ||
      g.awayId === ownerId
  );

  const isAlive = e =>
    qualified(
      e.kinds.get(ownerId)
    );

  const aliveEntries =
    baseline.entries.filter(isAlive);

  const watch = relevant
    .filter(g => g !== own)
    .map(g => {
      const homeOdds = calibrate(conditional(
        baseline.entries,
        g.index,
        g.homeId,
        ownerId
      ));

      const awayOdds = calibrate(conditional(
        baseline.entries,
        g.index,
        g.awayId,
        ownerId
      ));

      const homeAlive =
        aliveEntries.some(
          e =>
            e.winners[g.index] ===
            g.homeId
        );

      const awayAlive =
        aliveEntries.some(
          e =>
            e.winners[g.index] ===
            g.awayId
        );

      return {
        ...g,
        homeOdds,
        awayOdds,
        preferred:
          homeOdds >= awayOdds
            ? g.homeId
            : g.awayId,
        impact: Math.abs(homeOdds - awayOdds),
        mandatory:
          baseline.exact &&
          homeAlive !== awayAlive
            ? homeAlive
              ? g.homeId
              : g.awayId
            : null
      };
    })
    .filter(
      g =>
        g.homeOdds != null &&
        g.awayOdds != null
    )
    .sort(
      (a, b) =>
        b.impact - a.impact
    );

  const win = own
    ? calibrate(conditional(
        baseline.entries,
        own.index,
        ownerId,
        ownerId
      ))
    : null;

  const opponent = own
    ? own.homeId === ownerId
      ? own.awayId
      : own.homeId
    : null;

  const loss = own
    ? calibrate(conditional(
        baseline.entries,
        own.index,
        opponent,
        ownerId
      ))
    : null;

  const winAlive =
    own &&
    aliveEntries.some(
      e =>
        e.winners[own.index] ===
        ownerId
    );

  const lossAlive =
    own &&
    aliveEntries.some(
      e =>
        e.winners[own.index] ===
        opponent
    );

  const winOutcomes = own
    ? baseline.entries.filter(
        e =>
          e.winners[own.index] ===
          ownerId
      )
    : [];

  const winClinch =
    own &&
    winOutcomes.length > 0 &&
    winOutcomes.every(
      e =>
        e.kinds.get(ownerId) ===
        "clinch"
    );

  let headline = "Your best path to the playoffs";

  if (baseline.exact && own) {
    if (!winAlive && !lossAlive) {
      headline =
        "No remaining modeled playoff path";
    } else if (winClinch) {
      headline =
        "Win and you clinch (modeled)";
    } else if (
      winAlive &&
      !lossAlive
    ) {
      headline =
        "Must win this week";
    } else if (lossAlive) {
      headline =
        "A loss does not end every path";
    }
  }

  // Best and worst weekly combinations

  const grouped = new Map();

  for (const e of baseline.entries) {
    const key = relevant
      .map(
        g => e.winners[g.index]
      )
      .join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        winners: relevant.map(
          g => e.winners[g.index]
        ),
        total: 0,
        nominal: 0
      });
    }

    const item = grouped.get(key);

    item.total += e.weight;

    if (e.nominal.has(ownerId)) {
      item.nominal += e.weight;
    }
  }

  const situations = [
    ...grouped.values()
  ].map(g => ({
    ...g,
    odds: calibrate(g.total
      ? g.nominal / g.total
      : 0)
  }));

  situations.sort(
    (a, b) =>
      a.odds - b.odds
  );

  return {
    own,
    opponent,
    win,
    loss,
    headline,
    watch,
    relevant,
    worst: situations[0],
    best: situations[
      situations.length - 1
    ]
  };
}

// ==================================================
// FORMAT COMBINATION RESULTS
// ==================================================

function resultLines(
  games,
  winners,
  ownerId,
  byId
) {
  const name = id =>
    byId.get(id)?.ownerName ||
    "Unknown";

  return games.map((g, i) => {
    const win = winners[i];

    const lose =
      win === g.homeId
        ? g.awayId
        : g.homeId;

    return {
      id: g.id,
      text:
        `Week ${g.week}: ` +
        `${name(win)} beats ${name(lose)}`,
      own:
        g.homeId === ownerId ||
        g.awayId === ownerId
    };
  });
}

// ==================================================
// EXTENDED PLAYOFF PATHS: EXACT OR SAMPLED
// ==================================================

function FinalPaths({
  owner,
  teams,
  games,
  baseline,
  playoffCount,
  byId
}) {
  const [finish, setFinish] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const [opened, setOpened] =
    useState(null);

  const own = games
    .map(
      (g, i) => ({ ...g, i })
    )
    .filter(
      g =>
        g.homeId === owner.ownerId ||
        g.awayId === owner.ownerId
    );

  const describe = e =>
    own
      .map(
        g =>
          e.winners[g.i] ===
          owner.ownerId
            ? "W"
            : "L"
      )
      .join("");

  const paths = baseline.entries.filter(
    e =>
      qualified(
        e.kinds.get(owner.ownerId)
      ) &&
      (
        finish === "all" ||
        describe(e) === finish
      )
  );

  const patterns = [
    ...new Set(
      baseline.entries.map(describe)
    )
  ].sort(
    (a, b) =>
      (
        b.match(/W/g) || []
      ).length -
      (
        a.match(/W/g) || []
      ).length ||
      a.localeCompare(b)
  );

  const countByFinish = pattern =>
    baseline.entries.filter(
      e =>
        describe(e) === pattern &&
        qualified(
          e.kinds.get(owner.ownerId)
        )
    ).length;

  const possiblePatterns =
    patterns.filter(
      p => countByFinish(p) > 0
    );

  const smallestWins =
    possiblePatterns.length
      ? Math.min(
          ...possiblePatterns.map(
            p =>
              (
                p.match(/W/g) || []
              ).length
          )
        )
      : null;

  const mustWinOut =
    smallestWins === own.length;

  const maxPage = Math.max(
    1,
    Math.ceil(paths.length / PAGE_SIZE)
  );

  const safePage = Math.min(
    page,
    maxPage
  );

  const visible = paths.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const otherGames = games
    .map(
      (g, i) => ({ ...g, i })
    )
    .filter(
      g =>
        g.homeId !== owner.ownerId &&
        g.awayId !== owner.ownerId
    );

  // Identify outside results that occur
  // in every qualifying combination shown.

  const necessities = otherGames
    .map(g => {
      if (!paths.length) {
        return null;
      }

      const winner =
        paths[0].winners[g.i];

      return paths.every(
        e =>
          e.winners[g.i] === winner
      )
        ? { ...g, winner }
        : null;
    })
    .filter(Boolean);

  const name = id =>
    byId.get(id)?.ownerName ||
    "Unknown";

  return (
    <div className="dp-detail">
      <h3>
        What {owner.ownerName} Needs
        to Make the Playoffs
      </h3>

      {!baseline.exact && (
        <p className="dp-warning">
          Showing examples from {baseline.iterations.toLocaleString()} sampled seasons.
          These paths are not exhaustive, and shared results are not
          mathematically required. Zero sampled paths does not prove elimination.
        </p>
      )}

      <p className="dp-major">
        {smallestWins === null
          ? baseline.exact
            ? "NO QUALIFYING PLAYOFF PATH"
            : "NO QUALIFYING PATH FOUND IN SAMPLED OUTCOMES"
          : mustWinOut
          ? baseline.exact ? "MUST WIN OUT" : "WIN OUT IN EVERY SAMPLED QUALIFYING PATH"
          : smallestWins === 0
          ? "CAN STILL QUALIFY WITHOUT ANOTHER WIN"
          : `NEEDS AT LEAST ${smallestWins} MORE ${
              smallestWins === 1
                ? "WIN"
                : "WINS"
            } IN A POSSIBLE PATH`}
      </p>

      <p className="dp-muted">
        {baseline.exact
          ? "This is the minimum number of wins in any modeled qualifying combination. It does not mean that winning that many games guarantees a berth."
          : "These are examples from sampled outcomes, not an exhaustive list. A different winning path may exist, even when none was sampled."}
      </p>

      <div className="dp-filters">
        <button
          className={
            finish === "all" ? "on" : ""
          }
          onClick={() => {
            setFinish("all");
            setPage(1);
            setOpened(null);
          }}
        >
          All Qualifying Paths
        </button>

        {patterns.map(pattern => (
          <button
            key={pattern}
            className={
              finish === pattern
                ? "on"
                : ""
            }
            onClick={() => {
              setFinish(pattern);
              setPage(1);
              setOpened(null);
            }}
          >
            {
              (
                pattern.match(/W/g) || []
              ).length
            }
            -
            {
              (
                pattern.match(/L/g) || []
              ).length
            }
            {" ("}{pattern}{")"}
            {" · "}
            {countByFinish(pattern)}
          </button>
        ))}
      </div>

      <p>
        <b>
          {paths.length.toLocaleString()}
        </b>
        {" "}{baseline.exact ? "qualifying combinations" : "qualifying sampled outcomes"}
        match this finish.
      </p>

      {necessities.length > 0 && (
        <div className="dp-necessary">
          <b>
            {baseline.exact
              ? "Results Required in Every Qualifying Combination"
              : "Results Shared by Every Sampled Qualifying Path"}
          </b>

          {necessities.map(g => (
            <p key={g.id}>
              Week {g.week}:{" "}
              {name(g.winner)}
              {" must beat "}
              {name(
                g.winner === g.homeId
                  ? g.awayId
                  : g.homeId
              )}
            </p>
          ))}
        </div>
      )}

      <div className="dp-combinations">
        {visible.map((entry, i) => {
          const index =
            (safePage - 1) *
              PAGE_SIZE +
            i;

          const all = resultLines(
            games,
            entry.winners,
            owner.ownerId,
            byId
          );

          return (
            <div
              className="dp-path"
              key={index}
            >
              <button
                className="dp-path-trigger"
                onClick={() =>
                  setOpened(
                    opened === index
                      ? null
                      : index
                  )
                }
              >
                <span>
                  Combination {index + 1}

                  <small>
                    {label(
                      entry.kinds.get(
                        owner.ownerId
                      )
                    )}
                  </small>
                </span>

                <span>
                  {opened === index
                    ? "−"
                    : "+"}
                </span>
              </button>

              {opened === index && (
                <div className="dp-path-body">
                  <b>Your Games</b>

                  {all
                    .filter(x => x.own)
                    .map(x => (
                      <p key={x.id}>
                        {x.text}
                      </p>
                    ))}

                  <b>
                    Other Results in
                    This Combination
                  </b>

                  {all
                    .filter(x => !x.own)
                    .map(x => (
                      <p key={x.id}>
                        {x.text}
                      </p>
                    ))}

                  <small>
                    This is one complete
                    qualifying combination,
                    not necessarily the
                    only way to qualify.
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {maxPage > 1 && (
        <div className="dp-pagination">
          <button
            disabled={safePage <= 1}
            onClick={() => {
              setPage(p => p - 1);
              setOpened(null);
            }}
          >
            Previous
          </button>

          <span>
            Page {safePage} of {maxPage}
          </span>

          <button
            disabled={safePage >= maxPage}
            onClick={() => {
              setPage(p => p + 1);
              setOpened(null);
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ==================================================
// MAIN COMPONENT
// ==================================================

export default function ScenarioSimulator({
  teams = [],
  games = [],
  currentWeek = 1,
  season = 2026,
  playoffCount = 4,
  completedGames = [],
  seedingRule = ""
}) {
  const [selection, setSelection] =
    useState("");

  const byId = useMemo(
    () =>
      new Map(
        teams.map(
          t => [t.ownerId, t]
        )
      ),
    [teams]
  );

  const name = id =>
    byId.get(id)?.ownerName ||
    "Unknown";

  const baseline = useMemo(
    () =>
      model(
        teams,
        games,
        playoffCount,
        season
      ),
    [
      teams,
      games,
      playoffCount,
      season
    ]
  );

  const extendedAvailable =
    currentWeek >= EXTENDED_SCENARIOS_START_WEEK &&
    currentWeek <= REGULAR_SEASON_END_WEEK;

  const week = [
    ...new Set(
      games.map(g => g.week)
    )
  ]
    .sort((a, b) => a - b)
    .find(
      w => w >= currentWeek
    );

  // Every owner remains selectable.
  // Long shots don't disappear.

  const candidates = [...teams].sort(
    (a, b) =>
      String(a.ownerName).localeCompare(
        String(b.ownerName)
      )
  );

  const id = candidates.some(
    t =>
      t.ownerId === Number(selection)
  )
    ? Number(selection)
    : candidates.find(t => t.ownerName === "Reed Bushkuhl")?.ownerId ?? candidates[0]?.ownerId;

  const owner = byId.get(id);

  const stats =
    baseline.totals.get(id);
  const espnBaseline = owner?.espnPlayoffPct ?? null;
  const displayedBaseline = espnBaseline ?? stats?.odds ?? 0;

  // Mathematical elimination/clinching
  // only when exhaustive enumeration is
  // possible. Sampling is not proof.

  const ownerStatus = !stats
    ? "unknown"
    : baseline.exact &&
      stats.possible === 0
    ? "eliminated"
    : baseline.exact &&
      stats.clinch === baseline.iterations
    ? "clinched"
    : displayedBaseline < LONG_SHOT_CUTOFF
    ? "long-shot"
    : "in-hunt";

  // Even long-shot teams should get a concrete rooting guide.
  const showSurvivalAdvice = ownerStatus !== "unknown" && ownerStatus !== "eliminated" && ownerStatus !== "clinched";

  const statusName = {
    eliminated: "Eliminated (modeled)",
    clinched: "Clinched (modeled)",
    "long-shot": "Long Shot",
    "in-hunt": "In the Hunt",
    unknown: "Unknown"
  }[ownerStatus];

  const statusDescription = {
    eliminated:
      "No qualifying path exists in the complete modeled win/loss combinations. No rooting guide is needed.",

    clinched:
      "Every remaining modeled combination guarantees a playoff berth. No survival advice is needed.",

    "long-shot":
      `Projected playoff chance is below ${
        LONG_SHOT_CUTOFF * 100
      }%. A playoff path may still exist, but the detailed weekly rooting guide is hidden.`,

    unknown:
      "No playoff projection is available for this owner."
  }[ownerStatus];

  const report = useMemo(
    () =>
      owner &&
      showSurvivalAdvice &&
      week != null
        ? ownerReport(
            id,
            teams,
            games,
            baseline,
            week,
            espnBaseline
          )
        : null,
    [
      owner,
      showSurvivalAdvice,
      id,
      teams,
      games,
      baseline,
      week,
      espnBaseline
    ]
  );

  const noGames =
    games.length === 0;

  return (
    <div className="dp-root">

      {/* ========================================
          1. PLAYOFF PERCENTAGES
      ======================================== */}

      <section className="dp-panel">
        <span className="dp-kicker">
          PLAYOFF ANALYTICS
        </span>

        <h2>
          Playoff Percentages
        </h2>

        <p className="dp-muted">
          ESPN playoff probabilities when available. The simulator below separately models hypothetical win/loss outcomes.
        </p>

        <div className="dp-odds-grid">
          {[...teams]
            .sort(
              (a, b) =>
                (b.espnPlayoffPct ?? baseline.totals.get(b.ownerId).odds) -
                (a.espnPlayoffPct ?? baseline.totals.get(a.ownerId).odds)
            )
            .map(t => {
              const s =
                baseline.totals.get(
                  t.ownerId
                );
              const espn = t.espnPlayoffPct;
              const displayed = espn == null ? s.odds : espn;

              return (
                <div
                  className="dp-odds"
                  key={t.ownerId}
                >
                  <div className="dp-between">
                    <b>
                      {t.ownerName}
                    </b>

                    <b className="dp-gold">
                      {pct(displayed)}
                    </b>
                  </div>

                  <div className="dp-track">
                    <div
                      style={{
                        width:
                          `${100 * displayed}%`
                      }}
                    />
                  </div>
                   <small>{espn != null ? "ESPN standings playoff probability" : "Simulator estimate — ESPN projection unavailable"}</small>
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          These are ESPN's official standings playoff percentages, refreshed from ESPN when available. Hypothetical outcomes below remain independent estimates.
        </p>
      </section>

      {/* ========================================
          2. THIS WEEK: WHAT YOU NEED
      ======================================== */}

      <section className="dp-panel">
        <span className="dp-kicker">
          WEEKLY PLAYOFF GUIDE
        </span>

        <h2>
          Best Path to the Playoffs This Week
        </h2>

        <p className="dp-muted">
          Pick any owner to see which results give them the highest estimated chance of reaching the playoffs. Games are ranked by their impact on that owner, not by which opponent they like.
        </p>

        {owner && (
          <>
            <select
              className="dp-select"
              value={id}
              onChange={e =>
                setSelection(
                  e.target.value
                )
              }
            >
              {candidates.map(t => (
                <option
                  key={t.ownerId}
                  value={t.ownerId}
                >
                  {t.ownerName}
                </option>
              ))}
            </select>

            {!showSurvivalAdvice && (
              <div className="dp-report">
                <div className="dp-between">
                  <h3>
                    {name(id)}
                  </h3>

                  <span className="dp-pill">
                    {statusName}
                  </span>
                </div>

                <p className="dp-muted">
                  {statusDescription}
                </p>

                <p className="dp-muted">
                  Current playoff odds:{" "}
                  <b>
                    {pct(displayedBaseline)}
                  </b>
                </p>
              </div>
            )}

            {showSurvivalAdvice && report && (
              <div className="dp-report">
                <div className="dp-between">
                  <h3>
                    {name(id)}
                    {" · Week "}
                    {week}
                  </h3>

                  <span className="dp-pill">
                    {baseline.exact
                      ? report.headline
                      : "Projected Outlook"}
                  </span>
                </div>

                {report.own ? (
                  <>
                    <p>
                      <b>
                        Your matchup:
                      </b>
                      {" "}
                      {name(id)}
                      {" vs "}
                      {name(report.opponent)}
                    </p>

                    <div className="dp-two">
                      <div className="dp-stat">
                        <small>
                          IF YOU WIN
                        </small>

                        <strong className="dp-good">
                          {report.win == null
                            ? "—"
                            : pct(report.win)}
                        </strong>

                        <small>
                          ESPN-anchored estimate (not official ESPN scenario odds)
                        </small>
                      </div>

                      <div className="dp-stat">
                        <small>
                          IF YOU LOSE
                        </small>

                        <strong className="dp-bad">
                          {report.loss == null
                            ? "—"
                            : pct(report.loss)}
                        </strong>

                        <small>
                          ESPN-anchored estimate (not official ESPN scenario odds)
                        </small>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="dp-muted">
                    No remaining game this week
                    for this owner in the
                    supplied schedule.
                  </p>
                )}

                <h4>
                  Other Results That Help You Most
                </h4>

                {report.watch.length ? (
                  <>
                    <p className="dp-muted">
                      Root for the winner that maximizes your own playoff probability. The comparison includes all remaining games, not just this matchup. A difference below 1 percentage point is essentially a toss-up.
                    </p>
                    {report.watch.map(g => {
                      const negligible = !g.mandatory && g.impact < NEGLIGIBLE_SWING;
                      const small = !g.mandatory && g.impact < SMALL_SWING;
                      return (
                        <div key={g.id} className="dp-watch">
                          <b>{name(g.awayId)}{" vs "}{name(g.homeId)}</b>
                          <p>
                            {negligible ? (
                              <>Doesn't really matter who wins. Either result barely changes your playoff chances.</>
                            ) : (
                              <>
                                Root for{" "}
                                <b className="dp-gold">{name(g.mandatory || g.preferred)}</b>
                                {g.mandatory
                                  ? " — this result is required to keep a possible path alive."
                                  : small
                                    ? " — slight edge, but not a game worth worrying about."
                                    : " — this is a meaningful result for your playoff chances."}
                              </>
                            )}
                          </p>
                          <small className="dp-muted">
                            {g.mandatory ? "Must-have outcome · " : negligible ? "Little to no impact · " : small ? "Small impact · " : "Important matchup · "}
                            {Math.abs(100 * g.impact).toFixed(1)} percentage-point difference
                            {" · "}{name(g.homeId)} wins: {pct(g.homeOdds)}
                            {" · "}{name(g.awayId)} wins: {pct(g.awayOdds)}
                          </small>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="dp-muted">No other matchups were provided for this week.</p>
                )}

                {report.best && report.relevant.length > 0 && (
                  <div className="dp-watch" style={{borderColor:"#447968"}}>
                    <h4>Best combination of results this week</h4>
                    <p>These winners give {name(id)} the highest modeled chance to make the playoffs this week: <b className="dp-gold">{pct(report.best.odds)}</b>.</p>
                    {report.relevant.map((g, i) => (
                      <p key={g.id}>
                        <b>{name(report.best.winners[i])}</b> beats {name(report.best.winners[i] === g.homeId ? g.awayId : g.homeId)}
                      </p>
                    ))}
                    <small className="dp-muted">This is the best combination found by the model, not a prediction of which teams will actually win or an official ESPN scenario.</small>
                  </div>
                )}

                {report.worst &&
                  report.relevant.length > 0 && (
                    <details className="dp-details">
                      <summary>
                        Worst-Case Results
                        This Week
                        {" · "}
                        {pct(
                          report.worst.odds
                        )}
                        {" playoff chance"}
                      </summary>

                      {report.relevant.map(
                        (g, i) => (
                          <p key={g.id}>
                            {name(
                              report.worst
                                .winners[i]
                            )}
                            {" beats "}
                            {name(
                              report.worst
                                .winners[i] ===
                                g.homeId
                                ? g.awayId
                                : g.homeId
                            )}
                          </p>
                        )
                      )}
                    </details>
                  )}

                {report.best &&
                  report.relevant.length > 0 && (
                    <details className="dp-details">
                      <summary>
                        Best-Case Results
                        This Week
                        {" · "}
                        {pct(
                          report.best.odds
                        )}
                        {" playoff chance"}
                      </summary>

                      {report.relevant.map(
                        (g, i) => (
                          <p key={g.id}>
                            {name(
                              report.best
                                .winners[i]
                            )}
                            {" beats "}
                            {name(
                              report.best
                                .winners[i] ===
                                g.homeId
                                ? g.awayId
                                : g.homeId
                            )}
                          </p>
                        )
                      )}
                    </details>
                  )}
              </div>
            )}
          </>
        )}

        {!owner && (
          <p className="dp-muted">
            No owners are available
            to display.
          </p>
        )}
      </section>

      {/* ========================================
          3. ROAD TO THE PLAYOFFS
      ======================================== */}

      <section className="dp-panel dp-road-panel">
        <div className="dp-road-header">
          <div>
            <span className="dp-kicker">YOUR POSTSEASON PICTURE</span>
            <h2>Road to the Playoffs</h2>
            <p className="dp-muted">
              Choose an owner to see their playoff outlook, possible paths, and
              ESPN seeding tiebreakers in one place.
            </p>
          </div>
          {owner && <div className="dp-road-probability">
            <span>PLAYOFF CHANCE</span>
            <strong>{pct(displayedBaseline)}</strong>
            <small>{espnBaseline != null ? "ESPN projection" : "Model estimate"}</small>
          </div>}
        </div>

        {!baseline.exact && (
          <p className="dp-warning">
            These counts come from{" "}
            {SIMULATIONS.toLocaleString()}
            {" "}sampled seasons, not every
            mathematical outcome.
            Zero sampled paths does not
            prove elimination or clinching.
          </p>
        )}

        {owner && stats && (
          <>
            <select
              className="dp-select"
              value={id}
              onChange={e =>
                setSelection(
                  e.target.value
                )
              }
            >
              {candidates.map(t => (
                <option
                  key={t.ownerId}
                  value={t.ownerId}
                >
                  {t.ownerName}
                </option>
              ))}
            </select>

            <div className="dp-report dp-road-report">
              <div className="dp-between dp-road-owner-heading">
                <div>
                  <small className="dp-road-label">SELECTED OWNER</small>
                  <h3>{owner.ownerName}</h3>
                  <small className="dp-muted">{owner.wins}-{owner.losses} record · {owner.divisionName || "League standings"}</small>
                </div>
                <span className="dp-pill">{statusName}</span>
              </div>

              <div className="dp-three dp-road-stats">
                {[
                  { key: "clinch", title: "Berth guaranteed", color: "#55c993" },
                  { key: "hunt", title: "Tiebreaker dependent", color: "#e6b65b" },
                  { key: "out", title: "Misses playoffs", color: "#e47d83" }
                ].map(x => (
                  <div className="dp-stat dp-road-stat" key={x.key}>
                    <strong style={{ color: x.color }}>
                      {pct(stats[x.key] / Math.max(1, baseline.iterations))}
                    </strong>
                    <small>{x.title}</small>
                    <span>{stats[x.key].toLocaleString()} scenarios</span>
                  </div>
                ))}
              </div>

              <div className="dp-stack">
                {[
                  "clinch",
                  "hunt",
                  "out"
                ].map((k, i) => (
                  <div
                    key={k}
                    style={{
                      width: `${
                        100 *
                        stats[k] /
                        baseline.iterations
                      }%`,
                      background: [
                        "#55c993",
                        "#e6b65b",
                        "#e47d83"
                      ][i]
                    }}
                  />
                ))}
              </div>

              <small className="dp-muted">
                Out of{" "}
                {baseline.iterations.toLocaleString()}
                {" "}
                {baseline.exact
                  ? "remaining combinations"
                  : "sampled outcomes"}.
                {" "}The three categories
                do not overlap.
              </small>

              {!showSurvivalAdvice && (
                <p className="dp-muted">
                  {statusDescription}
                </p>
              )}

              {showSurvivalAdvice &&
                !extendedAvailable &&
                !noGames && (
                  <div className="dp-locked">
                    <b>Detailed playoff paths open in Week {EXTENDED_SCENARIOS_START_WEEK}</b>
                    <p>The weekly rooting guide remains available before then.</p>
                  </div>
                )}

              {showSurvivalAdvice &&
                extendedAvailable &&
                !noGames && (
                  <FinalPaths
                    key={owner.ownerId}
                    owner={owner}
                    teams={teams}
                    games={games}
                    baseline={baseline}
                    playoffCount={playoffCount}
                    byId={byId}
                  />
                )}

              <TiebreakerPanel
                ownerId={owner.ownerId}
                embedded
                teams={teams}
                completedGames={completedGames}
                seedingRule={seedingRule}
              />
            </div>
          </>
        )}

        {noGames && (
          <p className="dp-muted">
            No remaining regular-season
            games were supplied. The
            modeled playoff field is
            based on current records
            and points.
          </p>
        )}

        <p className="dp-muted">
          Model assumptions: if the league
          has exactly two divisions,
          division champions qualify
          automatically and the remaining
          berths go to wildcards. Winning
          percentage and total points
          determine modeled rankings.

          Actual ESPN playoff rules
          and the complete remaining
          schedule must match for
          clinching and elimination
          classifications to be definitive.
        </p>
      </section>

      {/* ========================================
          STYLES
      ======================================== */}

      <style jsx>{`
        .dp-root {
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin: 22px 0 45px;
          color: #f1f4f8;
        }

        .dp-panel.dp-road-panel {
          background: linear-gradient(165deg, #192535 0%, #121922 68%);
          border-color: #40546b;
        }
        .dp-road-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #344456;
        }
        .dp-road-header h2 {
          margin-bottom: 7px;
        }
        .dp-road-header p {
          max-width: 540px;
          margin: 0;
        }
        .dp-road-probability {
          display: flex;
          flex-direction: column;
          min-width: 160px;
          gap: 3px;
          padding: 14px 18px;
          background: #101d2b;
          border: 1px solid #536a82;
          border-radius: 12px;
        }
        .dp-road-probability span, .dp-road-label {
          color: #aebdd0;
          font-weight: 800;
          letter-spacing: 1.2px;
          font-size: 10px;
        }
        .dp-road-probability strong {
          font-size: 33px;
          line-height: 1.1;
          color: #e8c477;
        }
        .dp-road-probability small {
          color: #aebdd0;
          font-size: 11px;
        }
        .dp-road-report {
          background: #172333;
          border-color: #41566e;
          padding: 20px;
        }
        .dp-road-owner-heading {
          padding-bottom: 13px;
          border-bottom: 1px solid #34465c;
        }
        .dp-road-owner-heading h3 {
          margin: 5px 0;
          font-size: 21px;
        }
        .dp-road-stat {
          background: #101b29;
          border-color: #35495e;
          border-radius: 11px;
          padding: 16px 7px;
        }
        .dp-road-stat strong {
          font-size: clamp(20px, 4vw, 30px);
        }
        .dp-road-stat span {
          color: #8293a8;
          font-size: 10px;
        }
        .dp-panel {
          background: #171d26;
          border: 1px solid #303b49;
          border-radius: 14px;
          padding: 20px;
          min-width: 0;
        }

        .dp-kicker {
          color: #dcb666;
          letter-spacing: 1.2px;
          font-size: 10px;
          font-weight: 900;
        }

        .dp-panel h2 {
          font-size: 23px;
          margin: 8px 0 12px;
          color: white;
        }

        .dp-panel h3 {
          font-size: 18px;
          margin: 8px 0;
          color: #e7bd6a;
        }

        .dp-panel h4 {
          font-size: 14px;
          margin: 20px 0 10px;
          color: #e7bd6a;
        }

        .dp-muted {
          font-size: 12px;
          color: #aebacb;
          line-height: 1.7;
        }

        .dp-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .dp-gold {
          color: #e7bd6a;
        }

        .dp-good {
          color: #55c993;
        }

        .dp-bad {
          color: #e47d83;
        }

        .dp-odds-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 15px 0;
        }

        .dp-odds {
          background: #232d39;
          border: 1px solid #374454;
          padding: 14px;
          border-radius: 9px;
          font-size: 12px;
        }

        .dp-odds small {
          display: block;
          margin-top: 9px;
          color: #aebacb;
          font-size: 10px;
        }

        .dp-track {
          background: #364453;
          border-radius: 20px;
          height: 8px;
          overflow: hidden;
          margin-top: 11px;
        }

        .dp-track div {
          background: #dcb666;
          height: 100%;
        }

        .dp-select {
          width: 100%;
          max-width: 480px;
          margin: 12px 0;
          padding: 12px 13px;
          background: #273342;
          color: #fff;
          border: 1px solid #8a6b3b;
          border-radius: 9px;
        }

        .dp-report {
          background: #202a36;
          border: 1px solid #3a4655;
          border-radius: 11px;
          padding: 17px;
          margin: 10px 0;
        }

        .dp-report p {
          font-size: 12px;
          line-height: 1.7;
        }

        .dp-pill {
          background: #413720;
          color: #e7bd6a;
          border: 1px solid #866a40;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 800;
          padding: 8px 10px;
        }

        .dp-two,
        .dp-three {
          display: grid;
          gap: 9px;
          margin: 16px 0;
        }

        .dp-two {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
        }

        .dp-three {
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
        }

        .dp-stat {
          background: #171d26;
          border: 1px solid #354355;
          border-radius: 9px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
          padding: 14px 7px;
        }

        .dp-stat strong {
          font-size: 26px;
        }

        .dp-stat small {
          font-size: 10px;
          color: #aebacb;
        }

        .dp-watch {
          border-bottom:
            1px solid #3a4655;
          padding: 10px 0;
        }

        .dp-watch b {
          font-size: 12px;
        }

        .dp-watch p {
          margin: 7px 0;
        }

        .dp-details {
          border: 1px solid #3a4655;
          border-radius: 9px;
          padding: 12px;
          margin-top: 12px;
          background: #171d26;
        }

        .dp-details summary {
          cursor: pointer;
          color: #e7bd6a;
          font-size: 12px;
          font-weight: 800;
        }

        .dp-details p {
          margin: 8px 0;
        }

        .dp-necessary {
          padding: 14px;
          border: 1px solid #695839;
          border-radius: 9px;
          background: #302b23;
          margin: 14px 0;
        }

        .dp-necessary b {
          color: #edc777;
          font-size: 12px;
        }

        .dp-necessary p,
        .dp-necessary small {
          font-size: 11px;
          color: #d1d7df;
        }

        .dp-stack {
          height: 10px;
          display: flex;
          overflow: hidden;
          border-radius: 20px;
          margin: 16px 0;
          background: #354355;
        }

        .dp-stack div {
          height: 100%;
        }

        .dp-locked {
          background: #322c21;
          border: 1px solid #7a603b;
          border-radius: 9px;
          padding: 15px;
          margin-top: 16px;
        }

        .dp-locked b {
          font-size: 12px;
          color: #e7bd6a;
        }

        .dp-locked p {
          font-size: 12px;
          color: #d4c4a6;
        }

        .dp-warning {
          padding: 13px;
          background: #322c21;
          border: 1px solid #806539;
          border-radius: 9px;
          color: #ead0a0;
          font-size: 12px;
          line-height: 1.7;
        }

        .dp-detail {
          margin-top: 20px;
          border-top:
            1px solid #3a4655;
          padding-top: 12px;
        }

        .dp-major {
          font-size: 14px !important;
          font-weight: 900;
          color: #55c993 !important;
        }

        .dp-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 15px 0;
        }

        .dp-filters button,
        .dp-pagination button {
          background: #273343;
          border: 1px solid #647185;
          border-radius: 8px;
          color: #f3f5f8;
          padding: 10px;
          font-size: 11px;
          cursor: pointer;
        }

        .dp-filters button.on {
          border-color: #dcb666;
          color: #e7bd6a;
          background: #3b3424;
        }

        .dp-path {
          background: #171d26;
          border: 1px solid #354355;
          border-radius: 9px;
          margin: 8px 0;
          overflow: hidden;
        }

        .dp-path-trigger {
          width: 100%;
          padding: 13px;
          background: transparent;
          border: 0;
          color: #fff;
          display: flex;
          justify-content:
            space-between;
          text-align: left;
          cursor: pointer;
        }

        .dp-path-trigger small {
          display: block;
          color: #e7bd6a;
          margin-top: 5px;
        }

        .dp-path-body {
          padding: 13px;
          border-top:
            1px solid #354355;
          font-size: 12px;
        }

        .dp-path-body b {
          color: #e7bd6a;
        }

        .dp-path-body p {
          border-bottom:
            1px solid #354355;
          padding: 5px 0;
        }

        .dp-path-body small {
          color: #aebacb;
        }

        .dp-pagination {
          display: flex;
          justify-content:
            space-between;
          align-items: center;
          gap: 9px;
          margin: 14px 0;
          font-size: 12px;
        }

        .dp-pagination button:disabled {
          opacity: 0.3;
          cursor: default;
        }

        @media (max-width: 650px) {
          .dp-panel {
            padding: 14px;
          }

          .dp-odds-grid {
            grid-template-columns: 1fr;
          }

          .dp-stat strong {
            font-size: 20px;
          }

          .dp-three .dp-stat {
            padding: 10px 4px;
          }

          .dp-three .dp-stat small {
            font-size: 9px;
          }
        }
      `}</style>
    </div>
  );
}
