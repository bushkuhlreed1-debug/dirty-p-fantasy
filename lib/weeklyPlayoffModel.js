const EXACT_GAME_LIMIT = 14;
const SIMULATIONS = 25000;

const n = v => Number(v) || 0;

const rate = t => {
  const played =
    n(t.wins) + n(t.losses) + n(t.ties);

  return played
    ? (n(t.wins) + n(t.ties) / 2) / played
    : 0.5;
};

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

export function model(
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

export function ownerReport(
  ownerId,
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
