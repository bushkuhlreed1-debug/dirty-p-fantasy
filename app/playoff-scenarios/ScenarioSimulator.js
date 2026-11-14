
"use client";

import { useMemo, useState } from "react";

// Change this if Dirty P's regular season
// ends in a week other than Week 14.
const REGULAR_SEASON_END_WEEK = 14;
const EXACT_GAME_LIMIT = 14;
const SIMULATIONS = 25000;
const PAGE_SIZE = 8;

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

const qualified = kind =>
  kind !== "out";

const label = kind =>
  kind === "clinch"
    ? "Berth guaranteed in this outcome"
    : kind === "hunt"
    ? "Possible berth — points could matter"
    : "Eliminated in this outcome";

// =====================================================
// PLAYOFF FIELD
// =====================================================

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
    .filter(t => !chosen.has(t.ownerId))
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

// =====================================================
// CLINCH / HUNT / ELIMINATED
// =====================================================

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

// =====================================================
// APPLY REMAINING GAME RESULTS
// =====================================================

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

// =====================================================
// MATCHUP PROBABILITIES
// =====================================================

function chance(a, b) {
  if (!a || !b) return 0.5;

  const strength = t => {
    const played =
      n(t.wins) +
      n(t.losses) +
      n(t.ties);

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

// =====================================================
// SCENARIO MODEL
// =====================================================

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
    teams.map(t => [t.ownerId, t])
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

      const kind =
        result.kinds.get(id);

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

// =====================================================
// CONDITIONAL ODDS
// =====================================================

function conditional(
  entries,
  index,
  winner,
  ownerId,
  predicate = e =>
    e.nominal.has(ownerId)
) {
  let num = 0;
  let den = 0;

  for (const e of entries) {
    if (
      e.winners[index] !== winner
    ) {
      continue;
    }

    den += e.weight;

    if (predicate(e)) {
      num += e.weight;
    }
  }

  return den ? num / den : null;
}

// =====================================================
// THIS WEEK: WHAT YOU NEED
// =====================================================

function ownerReport(
  ownerId,
  teams,
  games,
  baseline,
  week
) {
  const relevant = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(g => g.week === week);

  const own = relevant.find(
    g =>
      g.homeId === ownerId ||
      g.awayId === ownerId
  );

  const alive = e =>
    qualified(
      e.kinds.get(ownerId)
    );

  const aliveEntries =
    baseline.entries.filter(alive);

  const watch = relevant
    .filter(g => g !== own)
    .map(g => {
      const homeOdds = conditional(
        baseline.entries,
        g.index,
        g.homeId,
        ownerId
      );

      const awayOdds = conditional(
        baseline.entries,
        g.index,
        g.awayId,
        ownerId
      );

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
        impact: Math.abs(
          (homeOdds || 0) -
          (awayOdds || 0)
        ),
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
    ? conditional(
        baseline.entries,
        own.index,
        ownerId,
        ownerId
      )
    : null;

  const opponent = own
    ? own.homeId === ownerId
      ? own.awayId
      : own.homeId
    : null;

  const loss = own
    ? conditional(
        baseline.entries,
        own.index,
        opponent,
        ownerId
      )
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

  const winClinch =
    own &&
    baseline.entries
      .filter(
        e =>
          e.winners[own.index] ===
          ownerId
      )
      .every(
        e =>
          e.kinds.get(ownerId) ===
          "clinch"
      );

  let headline = "Every game matters";

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
        nominal: 0,
        possible: 0
      });
    }

    const item = grouped.get(key);

    item.total += e.weight;

    if (e.nominal.has(ownerId)) {
      item.nominal += e.weight;
    }

    if (alive(e)) {
      item.possible += e.weight;
    }
  }

  const situations = [
    ...grouped.values()
  ].map(g => ({
    ...g,
    odds: g.total
      ? g.nominal / g.total
      : 0
  }));

  situations.sort(
    (a, b) => a.odds - b.odds
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

// =====================================================
// POINTS WATCH
// ONLY WHEN A SCORING TIEBREAKER MATTERS
// =====================================================

function pointsWatch(
  owner,
  teams,
  entries,
  games,
  slots
) {
  const relevant = new Map();

  const sample =
    entries.length > 2048
      ? entries.filter(
          (_, i) =>
            i %
              Math.ceil(
                entries.length / 2048
              ) ===
            0
        )
      : entries;

  for (const e of sample) {
    if (
      e.kinds.get(owner.ownerId) !==
      "hunt"
    ) {
      continue;
    }

    const state = apply(
      teams,
      games,
      e.winners
    );

    const me = state.find(
      t =>
        t.ownerId ===
        owner.ownerId
    );

    for (const rival of state) {
      if (
        rival.ownerId ===
        owner.ownerId
      ) {
        continue;
      }

      if (
        Math.abs(
          rate(rival) - rate(me)
        ) > 1e-9 ||
        n(rival.wins) !==
          n(me.wins)
      ) {
        continue;
      }

      const changed = state.map(
        t => ({ ...t })
      );

      const adjusted = changed.find(
        t =>
          t.ownerId ===
          owner.ownerId
      );

      adjusted.pointsFor =
        n(rival.pointsFor) + 0.01;

      const improves =
        field(
          changed,
          slots
        ).has(owner.ownerId) !==
        field(
          state,
          slots
        ).has(owner.ownerId);

      if (
        !improves &&
        !relevant.has(rival.ownerId)
      ) {
        continue;
      }

      relevant.set(
        rival.ownerId,
        rival
      );
    }
  }

  return [
    ...relevant.values()
  ].map(rival => {
    const gap = Math.round(
      (
        n(rival.pointsFor) -
        n(owner.pointsFor)
      ) * 100
    );

    return gap >= 0
      ? `${rival.ownerName}: outscore them by at least ${((gap + 1) / 100).toFixed(2)} fantasy points across the remaining games.`
      : `${rival.ownerName}: currently ahead by ${(-gap / 100).toFixed(2)} fantasy points; protect that lead.`;
  });
}

// =====================================================
// READABLE GAME RESULTS
// =====================================================

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

// =====================================================
// FINAL TWO WEEKS: ROAD TO PLAYOFFS
// =====================================================

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
    .map((g, i) => ({
      ...g,
      i
    }))
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
      baseline.entries.map(
        describe
      )
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

  const countByFinish = pat =>
    baseline.entries.filter(
      e =>
        describe(e) === pat &&
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
    Math.ceil(
      paths.length / PAGE_SIZE
    )
  );

  const safePage = Math.min(
    page,
    maxPage
  );

  const visible = paths.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const selectedPaths =
    baseline.entries.filter(
      e =>
        qualified(
          e.kinds.get(owner.ownerId)
        ) &&
        (
          finish === "all" ||
          describe(e) === finish
        )
    );

  const otherGames = games
    .map((g, i) => ({
      ...g,
      i
    }))
    .filter(
      g =>
        g.homeId !== owner.ownerId &&
        g.awayId !== owner.ownerId
    );

  const necessities = otherGames
    .map(g => {
      if (!selectedPaths.length) {
        return null;
      }

      const winner =
        selectedPaths[0].winners[g.i];

      return selectedPaths.every(
        e =>
          e.winners[g.i] === winner
      )
        ? {
            ...g,
            winner
          }
        : null;
    })
    .filter(Boolean);

  const pointsLines = useMemo(
    () =>
      pointsWatch(
        owner,
        teams,
        selectedPaths,
        games,
        playoffCount
      ),
    [
      owner,
      teams,
      selectedPaths.length,
      finish,
      games,
      playoffCount
    ]
  );

  const name = id =>
    byId.get(id)?.ownerName ||
    "Unknown";

  return (
    <div className="dp-detail">

      <h3>
        What {owner.ownerName} Needs
        to Make the Playoffs
      </h3>

      <p className="dp-major">
        {mustWinOut
          ? "MUST WIN OUT"
          : smallestWins === 0
          ? "CAN STILL QUALIFY WITHOUT ANOTHER WIN"
          : `NEEDS AT LEAST ${smallestWins} MORE ${
              smallestWins === 1
                ? "WIN"
                : "WINS"
            } IN A POSSIBLE PATH`}
      </p>

      <p className="dp-muted">
        This is the minimum number of
        wins in any modeled qualifying
        combination. Reaching that number
        alone does not necessarily
        guarantee a playoff berth.
      </p>

      <div className="dp-filters">
        <button
          className={
            finish === "all"
              ? "on"
              : ""
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
            {" "}
            ({pattern})
            {" · "}
            {countByFinish(pattern)}
          </button>
        ))}
      </div>

      <p>
        <b>
          {paths.length.toLocaleString()}
        </b>
        {" "}qualifying combinations
        match this finish.
      </p>

      {necessities.length > 0 && (
        <div className="dp-necessary">
          <b>
            Results Required in Every
            Qualifying Combination Shown
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

      {pointsLines.length > 0 && (
        <div className="dp-necessary">
          <b>
            Points-Scored Tiebreaker Watch
          </b>

          {pointsLines.map(line => (
            <p key={line}>
              {line}
            </p>
          ))}

          <small>
            Only relevant to modeled
            tied-record paths. Future
            fantasy points cannot be
            predicted exactly.
          </small>
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
                    combination, not
                    necessarily the only
                    way to qualify.
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
            disabled={page <= 1}
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
            disabled={page >= maxPage}
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

  const finalTwo =
    currentWeek >=
      REGULAR_SEASON_END_WEEK - 1 &&
    currentWeek <=
      REGULAR_SEASON_END_WEEK;

  const week = [
    ...new Set(
      games.map(g => g.week)
    )
  ]
    .sort((a, b) => a - b)
    .find(w => w >= currentWeek);

  const candidates = [...teams]
    .filter(t => {
      // Sampling cannot prove elimination.
      if (!baseline.exact) {
        return true;
      }

      const s = baseline.totals.get(
        t.ownerId
      );

      return (
        s &&
        s.possible > 0 &&
        s.clinch < baseline.iterations
      );
    })
    .sort(
      (a, b) =>
        String(a.ownerName)
          .localeCompare(
            String(b.ownerName)
          )
    );

  const id = candidates.some(
    t =>
      t.ownerId === Number(selection)
  )
    ? Number(selection)
    : candidates[0]?.ownerId;

  const owner = byId.get(id);

  const stats =
    baseline.totals.get(id);

  const report = useMemo(
    () =>
      owner && week != null
        ? ownerReport(
            id,
            teams,
            games,
            baseline,
            week
          )
        : null,
    [
      owner,
      id,
      teams,
      games,
      baseline,
      week
    ]
  );

  const pointsLines = useMemo(
    () =>
      owner && report
        ? pointsWatch(
            owner,
            teams,
            baseline.entries,
            games,
            playoffCount
          )
        : [],
    [
      owner,
      report,
      teams,
      baseline,
      games,
      playoffCount
    ]
  );

  const noGames =
    games.length === 0;

  return (
    <div className="dp-root">

      {/* ======================================
          SECTION 1: PLAYOFF PERCENTAGES
      ====================================== */}

      <section className="dp-panel">
        <span className="dp-kicker">
          DIRTY P ANALYTICS
        </span>

        <h2>Playoff Percentages</h2>

        <p className="dp-muted">
          Estimated playoff chances based
          on records, current points, and
          remaining games.
        </p>

        <div className="dp-odds-grid">
          {[...teams]
            .sort(
              (a, b) =>
                baseline.totals.get(
                  b.ownerId
                ).odds -
                baseline.totals.get(
                  a.ownerId
                ).odds
            )
            .map(t => {
              const s =
                baseline.totals.get(
                  t.ownerId
                );

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
                      {pct(s.odds)}
                    </b>
                  </div>

                  <div className="dp-track">
                    <div
                      style={{
                        width:
                          `${100 * s.odds}%`
                      }}
                    />
                  </div>

                  <small>
                    {s.possible.toLocaleString()}
                    {" of "}
                    {baseline.iterations.toLocaleString()}
                    {" "}
                    {baseline.exact
                      ? "possible outcomes"
                      : "sampled outcomes"}
                    {" "}
                    preserve a playoff path
                  </small>
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          {baseline.exact
            ? `All ${baseline.iterations.toLocaleString()} remaining win/loss combinations evaluated.`
            : `${SIMULATIONS.toLocaleString()} weighted-strength simulations sampled.`}
          {" "}Playoff percentages are
          estimates, not official ESPN odds.
        </p>
      </section>

      {/* ======================================
          SECTION 2: THIS WEEK
      ====================================== */}

      <section className="dp-panel">
        <span className="dp-kicker">
          WEEKLY PLAYOFF GUIDE
        </span>

        <h2>
          This Week: What You Need
        </h2>

        <p className="dp-muted">
          See what a win or loss means
          and which other results you
          should root for.
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

            {report && (
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
                      : "Projected outlook"}
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
                      {name(
                        report.opponent
                      )}
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
                          Estimated playoff chance
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
                          Estimated playoff chance
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
                  Who to Root For
                </h4>

                {report.watch.length ? (
                  report.watch.map(g => (
                    <div
                      key={g.id}
                      className="dp-watch"
                    >
                      <b>
                        {name(g.awayId)}
                        {" vs "}
                        {name(g.homeId)}
                      </b>

                      <p>
                        Root for{" "}
                        <b className="dp-gold">
                          {name(
                            g.mandatory ||
                            g.preferred
                          )}
                        </b>

                        {g.mandatory
                          ? " — required to preserve a possible path"
                          : " — the more favorable result"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="dp-muted">
                    No other matchups were
                    provided for this week.
                  </p>
                )}

                {report.worst &&
                  report.relevant.length > 0 && (
                    <details className="dp-details">
                      <summary>
                        Worst-case results
                        this week
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
                        Best-case results
                        this week
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

                {pointsLines.length > 0 && (
                  <div className="dp-necessary">
                    <b>
                      Points Scored Matters
                    </b>

                    {pointsLines.map(
                      line => (
                        <p key={line}>
                          {line}
                        </p>
                      )
                    )}

                    <small>
                      Shown only when a
                      modeled playoff
                      tiebreaker is affected
                      by scoring.
                    </small>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!owner && (
          <p className="dp-muted">
            No unresolved owner playoff
            races to display.
          </p>
        )}
      </section>

      {/* ======================================
          SECTION 3: ROAD TO PLAYOFFS
      ====================================== */}

      <section className="dp-panel">
        <span className="dp-kicker">
          POSTSEASON SURVIVAL
        </span>

        <h2>
          Road to the Playoffs
        </h2>

        <p className="dp-muted">
          See how many outcomes guarantee
          a berth, leave a path open, or
          eliminate an owner. Detailed
          combinations appear in the
          final two regular-season weeks.
        </p>

        {!baseline.exact && (
          <p className="dp-warning">
            These counts come from{" "}
            {SIMULATIONS.toLocaleString()}
            {" "}sampled seasons, not every
            mathematical outcome. Zero
            sampled paths does not prove
            elimination or clinching.
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

            <div className="dp-report">
              <div className="dp-between">
                <h3>
                  {owner.ownerName}
                </h3>

                <span className="dp-pill">
                  {baseline.exact
                    ? "In the Hunt"
                    : "Projected"}
                </span>
              </div>

              <div className="dp-three">
                {[
                  {
                    key: "clinch",
                    title: "Clinch Berth",
                    color: "#55c993"
                  },
                  {
                    key: "hunt",
                    title: "In the Hunt",
                    color: "#e6b65b"
                  },
                  {
                    key: "out",
                    title: "Eliminated",
                    color: "#e47d83"
                  }
                ].map(x => (
                  <div
                    className="dp-stat"
                    key={x.key}
                  >
                    <strong
                      style={{
                        color: x.color
                      }}
                    >
                      {stats[
                        x.key
                      ].toLocaleString()}
                    </strong>

                    <small>
                      {x.title}
                    </small>
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
                      width:
                        `${
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
                  : "sampled outcomes"}
                . The three categories
                never overlap.
              </small>

              {!finalTwo && !noGames && (
                <div className="dp-locked">
                  <b>
                    Detailed combinations
                    unlock in Weeks{" "}
                    {REGULAR_SEASON_END_WEEK - 1}
                    {"–"}
                    {REGULAR_SEASON_END_WEEK}
                  </b>

                  <p>
                    For now, use the weekly
                    guide above to see what
                    matters right away.
                  </p>
                </div>
              )}

              {finalTwo && baseline.exact && (
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

              {finalTwo && !baseline.exact && (
                <p className="dp-warning">
                  Too many games remain for
                  a complete combination list.
                  Scenario counts are still
                  estimates. Detailed paths
                  require{" "}
                  {EXACT_GAME_LIMIT}
                  {" "}or fewer remaining games.
                </p>
              )}
            </div>
          </>
        )}

        {noGames && (
          <p className="dp-muted">
            No remaining regular-season
            games were supplied. The modeled
            playoff field is fixed using
            current records and points.
          </p>
        )}

        <p className="dp-muted">
          Model assumptions: if the league
          has exactly two divisions,
          division champions qualify
          automatically, then the remaining
          berths go to wildcards. Winning
          percentage and total points
          break modeled ties.

          Actual ESPN playoff rules and
          the full remaining schedule must
          match for clinching and elimination
          classifications to be definitive.
        </p>
      </section>

      {/* ======================================
          STYLES
      ====================================== */}

      <style jsx>{`
        .dp-root {
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin: 22px 0 45px;
          color: #f1f4f8;
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
          border-top: 1px solid #3a4655;
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
          border-top: 1px solid #354355;
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
