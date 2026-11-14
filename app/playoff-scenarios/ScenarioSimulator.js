/
"use client";

import { useMemo, useState } from "react";

const RUNS = 25000;
const EXACT_LIMIT = 16;
const PAGE_SIZE = 8;

const num = value =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const percent = value =>
  `${(100 * value).toFixed(1)}%`;

const played = team =>
  num(team.wins) + num(team.losses) + num(team.ties);

const winPct = team =>
  played(team)
    ? (num(team.wins) + num(team.ties) / 2) / played(team)
    : 0.5;

const division = team =>
  team.divisionId == null || team.divisionId === ""
    ? null
    : String(team.divisionId);

const teamName = (map, id) =>
  map.get(id)?.ownerName || "Unknown owner";

// =====================================================
// DETERMINISTIC RANDOM GENERATOR
// =====================================================

function rand(seed) {
  let s = seed >>> 0;

  return () => {
    s = (s + 0x6d2b79f5) >>> 0;

    let t = s;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================
// TEAM STRENGTH MODEL
// =====================================================

function winChance(a, b) {
  if (!a || !b) return 0.5;

  const avg = team =>
    played(team)
      ? num(team.pointsFor) / played(team)
      : 100;

  const score = team => {
    const shrink = played(team) / (played(team) + 4);

    return shrink * (
      0.34 * (winPct(team) - 0.5) +
      Math.max(
        -0.16,
        Math.min(
          0.16,
          (avg(team) - 100) / 260
        )
      )
    );
  };

  return Math.max(
    0.15,
    Math.min(0.85, 0.5 + score(a) - score(b))
  );
}

// =====================================================
// PLAYOFF FIELD
// =====================================================

function seedField(
  teams,
  count,
  target = 0,
  preference = 0
) {
  const compare = (a, b) => {
    const result =
      winPct(b) - winPct(a) ||
      num(b.wins) - num(a.wins);

    if (result) return result;

    if (
      target &&
      preference &&
      (
        a.ownerId === target ||
        b.ownerId === target
      )
    ) {
      return a.ownerId === target
        ? -preference
        : preference;
    }

    return (
      num(b.pointsFor) - num(a.pointsFor) ||
      String(a.ownerName).localeCompare(
        String(b.ownerName)
      )
    );
  };

  const groups = new Map();

  for (const t of teams) {
    const d = division(t);

    if (d == null) continue;

    if (!groups.has(d)) {
      groups.set(d, []);
    }

    groups.get(d).push(t);
  }

  if (
    groups.size !== 2 ||
    teams.some(t => division(t) == null)
  ) {
    return new Set(
      [...teams]
        .sort(compare)
        .slice(0, count)
        .map(t => t.ownerId)
    );
  }

  const leaders = [...groups.values()].map(
    group => [...group].sort(compare)[0]
  );

  const leaderIds = new Set(
    leaders.map(t => t.ownerId)
  );

  const wild = teams
    .filter(t => !leaderIds.has(t.ownerId))
    .sort(compare)
    .slice(
      0,
      Math.max(0, count - leaders.length)
    );

  return new Set(
    [...leaders, ...wild].map(t => t.ownerId)
  );
}

// =====================================================
// EVALUATE ONE COMPLETE SEASON OUTCOME
// =====================================================

function evaluate(teams, games, bits, slots) {
  const state = teams.map(t => ({ ...t }));

  const lookup = new Map(
    state.map(t => [t.ownerId, t])
  );

  games.forEach((g, i) => {
    const home = lookup.get(g.homeId);
    const away = lookup.get(g.awayId);

    if (!home || !away) return;

    if (bits[i] === "1") {
      home.wins++;
      away.losses++;
    } else {
      away.wins++;
      home.losses++;
    }
  });

  const nominal = seedField(state, slots);

  const possible = new Set();
  const definite = new Set();

  for (const t of state) {
    if (
      seedField(
        state,
        slots,
        t.ownerId,
        1
      ).has(t.ownerId)
    ) {
      possible.add(t.ownerId);
    }

    if (
      seedField(
        state,
        slots,
        t.ownerId,
        -1
      ).has(t.ownerId)
    ) {
      definite.add(t.ownerId);
    }
  }

  return {
    state,
    nominal,
    possible,
    definite
  };
}

// =====================================================
// MONTE CARLO / EXHAUSTIVE PLAYOFF ENGINE
// =====================================================

function buildModel(
  teams,
  games,
  slots,
  picks = {},
  season = 2026,
  collect = false
) {
  const exact =
    games.filter(g => !picks[g.id]).length <=
    EXACT_LIMIT;

  const pending = games
    .map((g, i) => ({ ...g, index: i }))
    .filter(g => !picks[g.id]);

  const count = exact
    ? 2 ** pending.length
    : RUNS;

  const lookup = new Map(
    teams.map(t => [t.ownerId, t])
  );

  const probs = pending.map(g =>
    winChance(
      lookup.get(g.homeId),
      lookup.get(g.awayId)
    )
  );

  const rng = rand(
    season +
    7919 +
    Object.entries(picks).reduce(
      (v, [k, id]) =>
        v + String(k).length * 17 + Number(id),
      0
    )
  );

  const totals = new Map(
    teams.map(t => [
      t.ownerId,
      {
        weight: 0,
        count: 0,
        possible: 0,
        definite: 0
      }
    ])
  );

  const scenarios = [];

  let totalWeight = 0;

  for (let i = 0; i < count; i++) {
    const bits = Array(games.length).fill("0");

    let weight = 1;

    games.forEach((g, j) => {
      if (picks[g.id]) {
        bits[j] =
          Number(picks[g.id]) === g.homeId
            ? "1"
            : "0";
      }
    });

    pending.forEach((g, j) => {
      const homeWins = exact
        ? Boolean((i >> j) & 1)
        : rng() < probs[j];

      bits[g.index] = homeWins ? "1" : "0";

      if (exact) {
        weight *= homeWins
          ? probs[j]
          : 1 - probs[j];
      }
    });

    const pattern = bits.join("");

    const outcome = evaluate(
      teams,
      games,
      pattern,
      slots
    );

    totalWeight += weight;

    for (const t of teams) {
      const stat = totals.get(t.ownerId);

      if (outcome.nominal.has(t.ownerId)) {
        stat.weight += weight;
        stat.count++;
      }

      if (outcome.possible.has(t.ownerId)) {
        stat.possible++;
      }

      if (outcome.definite.has(t.ownerId)) {
        stat.definite++;
      }
    }

    if (collect) {
      scenarios.push({
        bits: pattern,
        possible: outcome.possible,
        definite: outcome.definite
      });
    }
  }

  for (const stat of totals.values()) {
    stat.odds =
      stat.weight / (totalWeight || 1);
  }

  return {
    exact,
    count,
    totals,
    scenarios
  };
}

// =====================================================
// POINTS-SCORED TIEBREAKER
// =====================================================

function pointsTarget(me, rival) {
  const gapCents = Math.round(
    (
      num(rival.pointsFor) -
      num(me.pointsFor)
    ) * 100
  );

  if (gapCents >= 0) {
    return (
      `Outscore ${rival.ownerName} by at least ` +
      `${((gapCents + 1) / 100).toFixed(2)} ` +
      `total points across the remaining weeks`
    );
  }

  return (
    `Currently ahead of ${rival.ownerName} by ` +
    `${(-gapCents / 100).toFixed(2)} points; ` +
    `protect that lead across the remaining weeks`
  );
}

// =====================================================
// MAIN PAGE COMPONENT
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

  const [ownerId, setOwnerId] = useState("");
  const [finish, setFinish] = useState("all");

  const [page, setPage] = useState(1);
  const [openPath, setOpenPath] = useState(null);

  const [weekOpen, setWeekOpen] = useState({
    [currentWeek]: true
  });

  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(
    () =>
      new Map(
        teams.map(t => [t.ownerId, t])
      ),
    [teams]
  );

  const baseline = useMemo(
    () =>
      buildModel(
        teams,
        games,
        playoffCount,
        {},
        season,
        true
      ),
    [teams, games, playoffCount, season]
  );

  const whatIf = useMemo(
    () =>
      submitted === null
        ? null
        : buildModel(
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

  const weeks = useMemo(
    () =>
      [...new Set(games.map(g => g.week))]
        .sort((a, b) => a - b),
    [games]
  );

  const selected = Number(ownerId);
  const owner = byId.get(selected);

  const showOwners = teams.filter(t => {
    const s = baseline.totals.get(t.ownerId);

    if (!s) return false;

    // Sampling cannot establish elimination.
    return baseline.exact
      ? s.possible > 0 &&
          s.definite < baseline.count
      : true;
  });

  const selectedGames = games
    .map((g, index) => ({
      ...g,
      index
    }))
    .filter(
      g =>
        g.homeId === selected ||
        g.awayId === selected
    );

  const scenarios = owner
    ? baseline.scenarios.filter(
        s =>
          s.possible.has(selected) &&
          (
            finish === "all" ||
            selectedGames
              .map(g => {
                const winner =
                  s.bits[g.index] === "1"
                    ? g.homeId
                    : g.awayId;

                return winner === selected
                  ? "W"
                  : "L";
              })
              .join("") === finish
          )
      )
    : [];

  const totalPages = Math.max(
    1,
    Math.ceil(scenarios.length / PAGE_SIZE)
  );

  const visible = scenarios.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  function selectOwner(value) {
    setOwnerId(value);
    setFinish("all");
    setPage(1);
    setOpenPath(null);
  }

  function selectFinish(value) {
    setFinish(value);
    setPage(1);
    setOpenPath(null);
  }

  function togglePick(game, winner) {
    setPicks(old => {
      const next = { ...old };

      if (next[game.id] === winner) {
        delete next[game.id];
      } else {
        next[game.id] = winner;
      }

      return next;
    });
  }

  function pathDetails(s) {
    const state = evaluate(
      teams,
      games,
      s.bits,
      playoffCount
    ).state;

    const current = state.find(
      t => t.ownerId === selected
    );

    const rivals = state.filter(
      t =>
        t.ownerId !== selected &&
        winPct(t) === winPct(current) &&
        num(t.wins) === num(current.wins)
    );

    const outside = games
      .map((g, index) => ({
        ...g,
        index
      }))
      .filter(
        g =>
          g.homeId !== selected &&
          g.awayId !== selected
      )
      .filter(g => {
        if (!baseline.exact) return true;

        // Check whether reversing this game
        // changes possible/guaranteed qualification.
        const flipped =
          s.bits.slice(0, g.index) +
          (
            s.bits[g.index] === "1"
              ? "0"
              : "1"
          ) +
          s.bits.slice(g.index + 1);

        const alt = evaluate(
          teams,
          games,
          flipped,
          playoffCount
        );

        return (
          alt.possible.has(selected) !==
            s.possible.has(selected) ||
          alt.definite.has(selected) !==
            s.definite.has(selected)
        );
      });

    return {
      rivals,
      outside
    };
  }

  return (
    <div className="dp-root">

      {/* ===========================================
          SECTION 1: PLAYOFF PERCENTAGES
      =========================================== */}

      <section className="dp-panel">
        <span className="dp-label">
          DIRTY P FANTASY FOOTBALL
        </span>

        <h2>Playoff Percentages</h2>

        <p className="dp-note">
          Estimated probabilities based on records,
          fantasy scoring averages, and remaining
          matchups.
        </p>

        <div className="dp-grid">
          {[...teams]
            .sort(
              (a, b) =>
                (
                  baseline.totals.get(b.ownerId)?.odds ||
                  0
                ) -
                (
                  baseline.totals.get(a.ownerId)?.odds ||
                  0
                )
            )
            .map(t => {
              const stat = baseline.totals.get(
                t.ownerId
              );

              return (
                <div
                  className="dp-odds"
                  key={t.ownerId}
                >
                  <div className="dp-between">
                    <strong>{t.ownerName}</strong>
                    <strong>
                      {percent(stat?.odds || 0)}
                    </strong>
                  </div>

                  <div className="dp-bar">
                    <div
                      style={{
                        width: `${
                          (stat?.odds || 0) * 100
                        }%`
                      }}
                    />
                  </div>

                  <small>
                    {stat?.count.toLocaleString()} /{" "}
                    {baseline.count.toLocaleString()}
                    {" "}
                    qualifying{" "}
                    {baseline.exact
                      ? "combinations"
                      : "simulations"}
                  </small>

                  {baseline.exact && (
                    <small>
                      {stat.possible === 0
                        ? "No qualifying modeled path"
                        : stat.definite === baseline.count
                        ? "Guaranteed in modeled paths"
                        : "Still in the race"}
                    </small>
                  )}
                </div>
              );
            })}
        </div>

        <p className="dp-note">
          {baseline.exact
            ? `All ${baseline.count.toLocaleString()} win/loss combinations evaluated; percentages are probability-weighted.`
            : `${RUNS.toLocaleString()} sampled seasons. A zero observed count does not prove elimination.`}
          {" "}
          Official ESPN tiebreakers are not fully
          modeled.
        </p>
      </section>

      {/* ===========================================
          SECTION 2: WHAT-IF SIMULATOR
      =========================================== */}

      <section className="dp-panel">
        <span className="dp-label">
          TEST THE PLAYOFF RACE
        </span>

        <h2>What-If Simulator</h2>

        <p className="dp-note">
          Pick any number of future matchup winners
          and press Run Scenario. Your choices do
          not change the actual league results.
        </p>

        {weeks.map(week => (
          <div
            className="dp-week"
            key={week}
          >
            <button
              className="dp-week-title"
              onClick={() =>
                setWeekOpen(old => ({
                  ...old,
                  [week]: !old[week]
                }))
              }
            >
              <strong>Week {week}</strong>
              <span>
                {weekOpen[week] ? "−" : "+"}
              </span>
            </button>

            {weekOpen[week] && (
              <div className="dp-week-games">
                {games
                  .filter(g => g.week === week)
                  .map(g => (
                    <div
                      className="dp-game"
                      key={g.id}
                    >
                      <button
                        className={
                          picks[g.id] === g.awayId
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          togglePick(g, g.awayId)
                        }
                      >
                        {teamName(
                          byId,
                          g.awayId
                        )}
                      </button>

                      <span>vs</span>

                      <button
                        className={
                          picks[g.id] === g.homeId
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          togglePick(g, g.homeId)
                        }
                      >
                        {teamName(
                          byId,
                          g.homeId
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}

        {!games.length && (
          <p className="dp-note">
            No remaining regular-season matchups
            are available.
          </p>
        )}

        <div className="dp-actions">
          <button
            className="dp-primary"
            onClick={() =>
              setSubmitted({ ...picks })
            }
          >
            Run Scenario
          </button>

          <button
            onClick={() => {
              setPicks({});
              setSubmitted(null);
            }}
          >
            Reset
          </button>
        </div>

        {whatIf && (
          <div className="dp-results">
            <h3>Scenario Results</h3>

            <p className="dp-note">
              Playoff chances after your picks.
              Changes are in percentage points,
              not fantasy points.
            </p>

            {[...teams]
              .sort(
                (a, b) =>
                  (
                    whatIf.totals.get(b.ownerId)?.odds ||
                    0
                  ) -
                  (
                    whatIf.totals.get(a.ownerId)?.odds ||
                    0
                  )
              )
              .map(t => {
                const before =
                  baseline.totals.get(t.ownerId)
                    ?.odds || 0;

                const after =
                  whatIf.totals.get(t.ownerId)
                    ?.odds || 0;

                const delta =
                  (after - before) * 100;

                return (
                  <div
                    className="dp-result"
                    key={t.ownerId}
                  >
                    <strong>{t.ownerName}</strong>

                    <span>
                      {percent(after)}
                    </span>

                    <span
                      className={
                        delta > 0.05
                          ? "positive"
                          : delta < -0.05
                          ? "negative"
                          : ""
                      }
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)} pp
                    </span>
                  </div>
                );
              })}

            <p className="dp-note">
              {whatIf.exact
                ? `${whatIf.count.toLocaleString()} remaining outcomes evaluated.`
                : `${RUNS.toLocaleString()} simulations run.`}
            </p>
          </div>
        )}
      </section>

      {/* ===========================================
          SECTION 3: ROAD TO THE PLAYOFFS
      =========================================== */}

      <section className="dp-panel">
        <span className="dp-label">
          AVAILABLE THROUGHOUT THE SEASON
        </span>

        <h2>Road to the Playoffs</h2>

        <p className="dp-note">
          Pick an owner to see each possible finish
          and the combinations that put them into
          the playoffs. Owners proven eliminated or
          clinched under the modeled results are
          hidden here.
        </p>

        {!baseline.exact && (
          <p className="dp-warning">
            More than {EXACT_LIMIT} games are
            unresolved. The paths below come from
            {` ${RUNS.toLocaleString()} `}
            sampled seasons, NOT every mathematical
            combination. Elimination and clinching
            cannot be certified from this sample.
          </p>
        )}

        <select
          className="dp-select"
          value={ownerId}
          onChange={e =>
            selectOwner(e.target.value)
          }
        >
          <option value="">
            Choose an owner
          </option>

          {showOwners
            .sort(
              (a, b) =>
                String(a.ownerName).localeCompare(
                  String(b.ownerName)
                )
            )
            .map(t => (
              <option
                key={t.ownerId}
                value={t.ownerId}
              >
                {t.ownerName}
              </option>
            ))}
        </select>

        {owner && (
          <>
            <div className="dp-summary">
              <strong>
                {owner.ownerName}
              </strong>

              <span>
                {scenarios.length.toLocaleString()}
                {" "}
                qualifying{" "}
                {baseline.exact
                  ? "combinations"
                  : "sampled outcomes"}
              </span>
            </div>

            <div className="dp-finishes">
              <button
                className={
                  finish === "all"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  selectFinish("all")
                }
              >
                All finishes
              </button>

              {selectedGames.length <= 4 &&
                Array.from(
                  {
                    length:
                      2 ** selectedGames.length
                  },
                  (_, mask) =>
                    Array.from(
                      {
                        length:
                          selectedGames.length
                      },
                      (_, i) =>
                        mask & (1 << i)
                          ? "W"
                          : "L"
                    ).join("")
                )
                  .sort(
                    (a, b) =>
                      b.split("W").length -
                        a.split("W").length ||
                      a.localeCompare(b)
                  )
                  .map(pattern => {
                    const tally = pattern
                      .split("")
                      .filter(
                        x => x === "W"
                      ).length;

                    return (
                      <button
                        className={
                          finish === pattern
                            ? "active"
                            : ""
                        }
                        key={pattern}
                        onClick={() =>
                          selectFinish(pattern)
                        }
                      >
                        {pattern
                          ? `${tally}-${pattern.length - tally} (${pattern})`
                          : "No games"}
                      </button>
                    );
                  })}
            </div>

            {selectedGames.length > 4 && (
              <p className="dp-note">
                All finishes are shown together
                because this owner has more than
                four remaining games.
              </p>
            )}

            {scenarios.length === 0 ? (
              <p className="dp-note">
                No qualifying paths found for
                this finish{" "}
                {baseline.exact
                  ? "in the complete modeled outcomes."
                  : "in the sample; other paths may exist."}
              </p>
            ) : (
              <>
                <p className="dp-note">
                  Each expandable combination
                  shows your required results,
                  meaningful outside matchups,
                  and any tied-record opponents.
                  Future fantasy scoring may
                  decide a conditional berth.
                </p>

                {visible.map((s, index) => {
                  const key =
                    `${page}-${index}-${s.bits}`;

                  const opening =
                    openPath === key;

                  const ownResults =
                    selectedGames.map(g => ({
                      g,
                      win:
                        (
                          s.bits[g.index] === "1"
                            ? g.homeId
                            : g.awayId
                        ) === selected
                    }));

                  return (
                    <div
                      className="dp-path"
                      key={key}
                    >
                      <button
                        className="dp-path-title"
                        onClick={() => {
                          setOpenPath(
                            opening ? null : key
                          );
                          setShowAll(false);
                        }}
                      >
                        <span>
                          <strong>
                            Combination{" "}
                            {(page - 1) *
                              PAGE_SIZE +
                              index +
                              1}
                          </strong>

                          <small>
                            {s.definite.has(selected)
                              ? "Berth guaranteed by results in this modeled path"
                              : "Potential berth — points tiebreaker may matter"}
                          </small>
                        </span>

                        <span>
                          {opening ? "−" : "+"}
                        </span>
                      </button>

                      {opening && (
                        <PathBody
                          state={s}
                          owner={owner}
                          ownResults={ownResults}
                          games={games}
                          byId={byId}
                          selected={selected}
                          showAll={showAll}
                          setShowAll={setShowAll}
                          pathDetails={pathDetails}
                        />
                      )}
                    </div>
                  );
                })}

                <div className="dp-pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => {
                      setPage(p => p - 1);
                      setOpenPath(null);
                    }}
                  >
                    Previous
                  </button>

                  <span>
                    Page {page} / {totalPages}
                  </span>

                  <button
                    disabled={page >= totalPages}
                    onClick={() => {
                      setPage(p => p + 1);
                      setOpenPath(null);
                    }}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <p className="dp-note">
          Assumptions: two division winners plus
          wild cards when two divisions are
          supplied; winning percentage, wins,
          then total points scored.

          Mathematical labels apply only to the
          supplied games and modeled rules.

          Points requirements assume total points
          is the applicable tiebreaker and scores
          have two decimal places.
        </p>
      </section>

      {/* ===========================================
          STYLES
      =========================================== */}

      <style jsx>{`
        .dp-root {
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin: 24px 0 42px;
          color: #f4f5f7;
        }

        .dp-panel {
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
          padding: 20px;
          min-width: 0;
        }

        .dp-label {
          font-size: 10px;
          font-weight: 900;
          color: #d7ad63;
          letter-spacing: 1.2px;
        }

        h2 {
          font-size: 23px;
          margin: 7px 0 13px;
          color: #fff;
        }

        h3 {
          font-size: 16px;
          color: #e9bd67;
        }

        .dp-note {
          font-size: 12px;
          line-height: 1.7;
          color: #a9b6c5;
          margin: 10px 0 15px;
        }

        .dp-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .dp-odds {
          background: #242c38;
          border: 1px solid #364252;
          border-radius: 9px;
          padding: 14px;
        }

        .dp-between,
        .dp-summary {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }

        .dp-between strong {
          font-size: 13px;
        }

        .dp-between strong:last-child {
          color: #e9bd67;
          font-size: 19px;
        }

        .dp-odds small {
          display: block;
          color: #aeb9c7;
          font-size: 10px;
          margin-top: 7px;
        }

        .dp-bar {
          height: 8px;
          border-radius: 99px;
          background: #35404f;
          margin-top: 11px;
          overflow: hidden;
        }

        .dp-bar div {
          height: 100%;
          background: #d7ad63;
          border-radius: 99px;
        }

        button {
          cursor: pointer;
        }

        .dp-week,
        .dp-path {
          background: #202733;
          border: 1px solid #364252;
          border-radius: 9px;
          margin: 9px 0;
          overflow: hidden;
        }

        .dp-week-title,
        .dp-path-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          width: 100%;
          background: transparent;
          border: 0;
          color: #f4f5f7;
          padding: 15px;
          text-align: left;
        }

        .dp-week-games {
          padding: 0 14px 14px;
        }

        .dp-game {
          display: grid;
          grid-template-columns:
            minmax(0,1fr) 24px minmax(0,1fr);
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }

        .dp-game span {
          text-align: center;
          font-size: 11px;
          color: #a9b6c5;
        }

        .dp-game button {
          border: 1px solid #465364;
          border-radius: 8px;
          padding: 12px 7px;
          background: #303a49;
          color: #fff;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .dp-game button.active,
        .dp-finishes button.active {
          border-color: #d7ad63;
          background: #453a25;
          color: #f4cf8a;
        }

        .dp-actions,
        .dp-finishes {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 15px 0;
        }

        .dp-actions button,
        .dp-pagination button,
        .dp-finishes button {
          background: #303a49;
          border: 1px solid #465364;
          color: #f4f5f7;
          border-radius: 8px;
          padding: 10px 13px;
          font-size: 12px;
          font-weight: 750;
        }

        .dp-actions .dp-primary {
          background: #d7ad63;
          color: #171d26;
          border-color: #d7ad63;
        }

        .dp-results {
          border-top: 1px solid #35404f;
          margin-top: 18px;
          padding-top: 10px;
        }

        .dp-result {
          display: grid;
          grid-template-columns:
            minmax(0,1fr) 66px 75px;
          gap: 10px;
          border-bottom: 1px solid #303947;
          padding: 11px 0;
          font-size: 12px;
        }

        .dp-result span {
          text-align: right;
        }

        .positive {
          color: #62d49c;
        }

        .negative {
          color: #ed8388;
        }

        .dp-warning {
          background: #352f22;
          border: 1px solid #806539;
          border-radius: 9px;
          color: #f0d09a;
          padding: 13px;
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-select {
          width: 100%;
          max-width: 440px;
          padding: 13px;
          background: #242c38;
          color: #fff;
          border: 1px solid #806539;
          border-radius: 9px;
        }

        .dp-summary {
          background: #242c38;
          border-radius: 9px;
          padding: 14px;
          margin: 16px 0;
          font-size: 13px;
        }

        .dp-summary span {
          color: #e9bd67;
        }

        .dp-path-title small {
          display: block;
          font-size: 11px;
          font-weight: 400;
          color: #a9b6c5;
          margin-top: 6px;
        }

        .dp-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 16px;
          font-size: 12px;
        }

        .dp-pagination button:disabled {
          opacity: .35;
          cursor: default;
        }

        @media(max-width:650px) {
          .dp-grid {
            grid-template-columns: 1fr;
          }

          .dp-panel {
            padding: 14px;
          }

          h2 {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}

// =====================================================
// EXPANDABLE QUALIFYING COMBINATION
// =====================================================

function PathBody({
  state,
  owner,
  ownResults,
  games,
  byId,
  selected,
  showAll,
  setShowAll,
  pathDetails
}) {
  const details = pathDetails(state);

  const outsideAll = games
    .map((g, index) => ({
      ...g,
      index
    }))
    .filter(
      g =>
        g.homeId !== selected &&
        g.awayId !== selected
    );

  const selectedOutside = showAll
    ? outsideAll
    : details.outside;

  return (
    <div className="path-body">
      <h4>
        What {owner.ownerName} needs to do
      </h4>

      {ownResults.length ? (
        ownResults.map(({ g, win }) => (
          <p key={g.id}>
            Week {g.week}:{" "}
            <b>
              {win ? "Beat" : "Lose to"}{" "}
              {teamName(
                byId,
                g.homeId === selected
                  ? g.awayId
                  : g.homeId
              )}
            </b>
          </p>
        ))
      ) : (
        <p>No remaining games.</p>
      )}

      <h4>
        Outside Help — Results That Matter
      </h4>

      {selectedOutside.length ? (
        selectedOutside.map(g => {
          const winner =
            state.bits[g.index] === "1"
              ? g.homeId
              : g.awayId;

          const loser =
            winner === g.homeId
              ? g.awayId
              : g.homeId;

          return (
            <p key={g.id}>
              Week {g.week}:{" "}
              <b>
                {teamName(byId, winner)}
              </b>
              {" "}beats{" "}
              {teamName(byId, loser)}
            </p>
          );
        })
      ) : (
        <p>
          No single outside result changes
          this combination's qualification status.
        </p>
      )}

      <button
        className="show-all"
        onClick={() =>
          setShowAll(!showAll)
        }
      >
        {showAll
          ? "Hide other games"
          : "Show every other game's result"}
      </button>

      <h4>
        Total-Points Tiebreakers
      </h4>

      {details.rivals.length ? (
        details.rivals.map(t => (
          <p key={t.ownerId}>
            {pointsTarget(owner, t)}
          </p>
        ))
      ) : (
        <p>
          No opponents have an identical
          final record in this combination.
        </p>
      )}

      {!state.definite.has(selected) && (
        <p className="warn">
          This is a possible playoff berth,
          not a guarantee. Future fantasy
          points may decide a tie. Pairwise
          targets are informational; not every
          tied opponent necessarily has to
          be passed to qualify.
        </p>
      )}

      <p className="muted">
        Outside games are filtered to results
        whose single reversal changes the
        owner's possible or guaranteed status.
        Other games can still affect seeds,
        scoring ties, or alternative
        qualifying paths.
      </p>

      <style jsx>{`
        .path-body {
          padding: 2px 15px 15px;
          border-top: 1px solid #35404f;
          color: #dce3eb;
        }

        h4 {
          color: #e9bd67;
          font-size: 13px;
          margin: 17px 0 9px;
        }

        p {
          font-size: 12px;
          line-height: 1.6;
          margin: 8px 0;
          padding-bottom: 7px;
          border-bottom: 1px solid #303947;
        }

        .show-all {
          background: #303a49;
          border: 1px solid #806539;
          border-radius: 8px;
          color: #e9bd67;
          font-size: 11px;
          font-weight: 800;
          padding: 10px 12px;
          margin-top: 8px;
          cursor: pointer;
        }

        .warn {
          color: #f0d09a;
        }

        .muted {
          color: #9eacbd;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}
