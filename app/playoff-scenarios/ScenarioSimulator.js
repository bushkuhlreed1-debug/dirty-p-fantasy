
"use client";
import { useMemo, useState } from "react";

const RUNS = 25000;
const MAX_EXACT_GAMES = 16;
const money = x => Number(x || 0).toFixed(2);
const percent = x => `${(100 * (x || 0)).toFixed(1)}%`;
const record = t => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;
const played = t => t.wins + t.losses + t.ties;
const winRate = t => played(t) ? (t.wins + 0.5 * t.ties) / played(t) : 0.5;
const average = t => played(t) ? t.pointsFor / played(t) : 100;
const copyTeams = teams => teams.map(t => ({ ...t }));
const division = t => t.divisionId == null || t.divisionId === "" ? null : String(t.divisionId);

function compare(a, b, preferredId = 0, preference = 0) {
  const primary = winRate(b) - winRate(a) || b.wins - a.wins;
  if (primary) return primary;

  // Favor or disfavor one owner when future
  // points-based tiebreakers are unresolved.
  if (preferredId && preference &&
    (a.ownerId === preferredId || b.ownerId === preferredId)) {
    return a.ownerId === preferredId ? -preference : preference;
  }

  return b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName);
}

function field(teams, slots, preferredId = 0, preference = 0) {
  const cmp = (a, b) => compare(a, b, preferredId, preference);
  const groups = new Map();

  teams.forEach(t => {
    const d = division(t);
    if (d !== null) {
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(t);
    }
  });

  if (groups.size !== 2 || teams.some(t => division(t) === null)) {
    return [...teams].sort(cmp).slice(0, slots).map(t => t.ownerId);
  }

  const leaders = [...groups.values()]
    .map(g => [...g].sort(cmp)[0])
    .sort(cmp);

  const leaderIds = new Set(leaders.map(t => t.ownerId));

  const wildcards = teams
    .filter(t => !leaderIds.has(t.ownerId))
    .sort(cmp)
    .slice(0, Math.max(0, slots - leaders.length));

  return [...leaders, ...wildcards].map(t => t.ownerId);
}

function apply(byId, g, winner) {
  const home = byId.get(g.homeId);
  const away = byId.get(g.awayId);

  if (!home || !away) return;

  if (winner === home.ownerId) {
    home.wins++;
    away.losses++;
  }

  if (winner === away.ownerId) {
    away.wins++;
    home.losses++;
  }
}

function addPicks(teams, games, picks) {
  const result = copyTeams(teams);
  const byId = new Map(result.map(t => [t.ownerId, t]));

  games.forEach(g => {
    if (picks[g.id]) apply(byId, g, Number(picks[g.id]));
  });

  return result;
}

function strength(t) {
  const stabilization = played(t) / (played(t) + 4);

  return stabilization * (
    0.34 * (winRate(t) - 0.5) +
    Math.max(-0.16, Math.min(0.16, (average(t) - 100) / 260))
  );
}

function chance(a, b) {
  return Math.max(
    0.15,
    Math.min(0.85, 0.5 + strength(a) - strength(b))
  );
}

function seeded(seed) {
  let v = seed >>> 0;

  return () => {
    v = (v + 0x6d2b79f5) >>> 0;
    let x = v;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// PLAYOFF PROBABILITY ENGINE

function simulate(teams, games, picks, slots, seed) {
  const fixed = addPicks(teams, games, picks);
  const pending = games.filter(g => !picks[g.id]);
  const byOriginal = new Map(teams.map(t => [t.ownerId, t]));
  const odds = new Map(teams.map(t => [t.ownerId, 0]));
  const rng = seeded(seed);

  const exact = pending.length <= 12;
  const attempts = exact ? 2 ** pending.length : RUNS;

  const probabilities = pending.map(g =>
    chance(byOriginal.get(g.homeId), byOriginal.get(g.awayId))
  );

  let weightTotal = 0;

  for (let i = 0; i < attempts; i++) {
    const state = copyTeams(fixed);
    const byId = new Map(state.map(t => [t.ownerId, t]));
    let weight = 1;

    pending.forEach((g, j) => {
      const homeWins = exact
        ? Boolean((i >> j) & 1)
        : rng() < probabilities[j];

      if (exact) {
        weight *= homeWins
          ? probabilities[j]
          : 1 - probabilities[j];
      }

      apply(
        byId,
        g,
        homeWins ? g.homeId : g.awayId
      );
    });

    weightTotal += weight;

    field(state, slots).forEach(id =>
      odds.set(id, odds.get(id) + weight)
    );
  }

  for (const [id, value] of odds) {
    odds.set(id, value / (weightTotal || 1));
  }

  return { odds, attempts, exact };
}

// EXHAUSTIVE PLAYOFF PATH ENGINE

function enumeratePaths(teams, games, slots) {
  if (games.length > MAX_EXACT_GAMES) return null;

  const paths = new Map(
    teams.map(t => [t.ownerId, []])
  );

  const stats = new Map(
    teams.map(t => [
      t.ownerId,
      { possible: 0, certain: 0 }
    ])
  );

  const outcomes = 2 ** games.length;

  for (let mask = 0; mask < outcomes; mask++) {
    const state = copyTeams(teams);
    const byId = new Map(
      state.map(t => [t.ownerId, t])
    );

    const winners = games.map((g, i) =>
      ((mask >> i) & 1) ? g.homeId : g.awayId
    );

    games.forEach((g, i) =>
      apply(byId, g, winners[i])
    );

    for (const owner of teams) {
      const possible = field(
        state, slots, owner.ownerId, 1
      ).includes(owner.ownerId);

      if (!possible) continue;

      const certain = field(
        state, slots, owner.ownerId, -1
      ).includes(owner.ownerId);

      stats.get(owner.ownerId).possible++;

      if (certain) {
        stats.get(owner.ownerId).certain++;
      }

      paths.get(owner.ownerId).push({
        mask,
        certain
      });
    }
  }

  return { paths, stats, outcomes };
}

// TOTAL POINTS TIEBREAKER

function targetAgainst(me, opponent) {
  const gap =
    Number(opponent.pointsFor) - Number(me.pointsFor);

  if (gap >= 0) {
    return `Outscore ${opponent.ownerName} by at least ${money(gap + 0.01)} more points across the remaining weeks`;
  }

  return `You lead ${opponent.ownerName} by ${money(-gap)} points; don't let them outscore you by ${money(-gap)} or more`;
}

// MAIN COMPONENT

export default function ScenarioSimulator({
  teams = [],
  games = [],
  currentWeek = 1,
  season = 2026,
  playoffCount = 4
}) {
  const [picks, setPicks] = useState({});
  const [appliedPicks, setAppliedPicks] = useState({});
  const [hasRun, setHasRun] = useState(false);
  const [shown, setShown] = useState({});
  const [weekOpen, setWeekOpen] = useState({
    [currentWeek]: true
  });

  const byId = useMemo(
    () => new Map(
      teams.map(t => [t.ownerId, t])
    ),
    [teams]
  );

  const byName = id =>
    byId.get(id)?.ownerName || "Unknown";

  const baseline = useMemo(
    () => simulate(
      teams, games, {}, playoffCount, season + 71
    ),
    [teams, games, playoffCount, season]
  );

  const result = useMemo(
    () => hasRun
      ? simulate(
          teams,
          games,
          appliedPicks,
          playoffCount,
          season + 71
        )
      : baseline,
    [
      teams,
      games,
      playoffCount,
      season,
      appliedPicks,
      hasRun,
      baseline
    ]
  );

  const weeks = [
    ...new Set(games.map(g => g.week))
  ].sort((a, b) => a - b);

  const lastWeek = weeks.length
    ? weeks[weeks.length - 1]
    : 0;

  const finalTwo =
    lastWeek > 0 &&
    currentWeek >= lastWeek - 1;

  const exact = useMemo(
    () => finalTwo
      ? enumeratePaths(teams, games, playoffCount)
      : null,
    [finalTwo, teams, games, playoffCount]
  );

  const picked = Object.keys(picks).length;

  const indexedGames = games.map((g, i) => ({
    ...g,
    position: i
  }));

  const possibleOwners = exact
    ? teams.filter(t => {
        const s = exact.stats.get(t.ownerId);

        return s?.possible > 0 &&
          s?.certain < exact.outcomes;
      })
    : [];

  function choose(g, id) {
    setPicks(old => {
      const next = { ...old };

      if (next[g.id] === id) {
        delete next[g.id];
      } else {
        next[g.id] = id;
      }

      return next;
    });
  }

  function run() {
    setAppliedPicks({ ...picks });
    setHasRun(true);
  }

  function reset() {
    setPicks({});
    setAppliedPicks({});
    setHasRun(false);
  }

  return (
    <div className="dp-root">

      {/* SECTION ONE: PLAYOFF ODDS */}

      <section className="dp-panel">
        <div className="dp-heading">
          <div>
            <span className="dp-kicker">
              DIRTY P ANALYTICS
            </span>
            <h2>Playoff Percentages</h2>
          </div>
          <span className="dp-small">
            Week {currentWeek}
          </span>
        </div>

        <p className="dp-muted">
          Estimated playoff chances using current
          results and the remaining schedule.
          These are not official ESPN probabilities.
        </p>

        <div className="dp-odds">
          {[...teams]
            .sort(
              (a, b) =>
                (baseline.odds.get(b.ownerId) || 0) -
                (baseline.odds.get(a.ownerId) || 0)
            )
            .map(t => {
              const value =
                baseline.odds.get(t.ownerId) || 0;

              const s = exact?.stats.get(t.ownerId);

              const status = exact
                ? s.possible === 0
                  ? "Eliminated in modeled outcomes"
                  : s.certain === exact.outcomes
                  ? "Clinched in modeled outcomes"
                  : "Still alive"
                : null;

              return (
                <div
                  className="dp-odds-row"
                  key={t.ownerId}
                >
                  <div className="dp-odds-top">
                    <strong>{t.ownerName}</strong>
                    <strong>{percent(value)}</strong>
                  </div>

                  <div className="dp-progress">
                    <div
                      style={{
                        width: `${value * 100}%`
                      }}
                    />
                  </div>

                  {status && <small>{status}</small>}
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          {baseline.exact
            ? `Probability-weighted evaluation of ${baseline.attempts.toLocaleString()} outcomes.`
            : `${baseline.attempts.toLocaleString()} Monte Carlo simulations.`}
          {" "}
          Probabilities use scoring averages and
          win records; future fantasy points
          remain unknown.
        </p>
      </section>

      {/* SECTION TWO: WHAT IF */}

      <section className="dp-panel">
        <div className="dp-heading">
          <div>
            <span className="dp-kicker">
              TRY ANY OUTCOME
            </span>
            <h2>What-If Simulator</h2>
          </div>
          <span className="dp-small">
            {picked}/{games.length} picked
          </span>
        </div>

        <p className="dp-muted">
          Choose winners, then press Run Scenario.
          Results update only when you run the model.
        </p>

        {weeks.map(week => (
          <div className="dp-week" key={week}>
            <button
              className="dp-week-head"
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
              <div className="dp-week-body">
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
                          choose(g, g.awayId)
                        }
                      >
                        {byName(g.awayId)}
                      </button>

                      <span>vs</span>

                      <button
                        className={
                          picks[g.id] === g.homeId
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          choose(g, g.homeId)
                        }
                      >
                        {byName(g.homeId)}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}

        {!games.length && (
          <p className="dp-muted">
            No remaining regular-season games
            were returned.
          </p>
        )}

        <div className="dp-buttons">
          <button
            className="dp-gold"
            onClick={run}
          >
            Run Scenario
          </button>

          <button onClick={reset}>
            Reset All
          </button>
        </div>

        {hasRun && (
          <div className="dp-results">
            <h3>Scenario Results</h3>

            <p className="dp-muted">
              Changes compared with current
              projected playoff chances.
              Selected winners are treated
              as certain.
            </p>

            {[...teams]
              .sort(
                (a, b) =>
                  (result.odds.get(b.ownerId) || 0) -
                  (result.odds.get(a.ownerId) || 0)
              )
              .map(t => {
                const before =
                  baseline.odds.get(t.ownerId) || 0;

                const after =
                  result.odds.get(t.ownerId) || 0;

                const change =
                  (after - before) * 100;

                return (
                  <div
                    className="dp-result"
                    key={t.ownerId}
                  >
                    <strong>{t.ownerName}</strong>

                    <span>{percent(after)}</span>

                    <span
                      className={
                        change > 0.05
                          ? "up"
                          : change < -0.05
                          ? "down"
                          : ""
                      }
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(1)} pts
                    </span>
                  </div>
                );
              })}

            <p className="dp-muted">
              {result.exact
                ? "Every undecided W/L outcome was evaluated with probability weights."
                : `${RUNS.toLocaleString()} simulations run.`}
            </p>
          </div>
        )}
      </section>

      {/* SECTION THREE: PLAYOFF SURVIVAL */}

      {finalTwo && (
        <section className="dp-panel">
          <span className="dp-kicker">
            FINAL TWO REGULAR-SEASON WEEKS
          </span>

          <h2>Road to the Playoffs</h2>

          {!exact ? (
            <p className="dp-muted">
              There are more than
              {" "}{MAX_EXACT_GAMES} remaining games.
              Exact scenario claims are disabled
              to avoid missing outcomes.
              The complete schedule is needed
              for exhaustive analysis.
            </p>
          ) : (
            <>
              <p className="dp-muted">
                All
                {" "}{exact.outcomes.toLocaleString()}
                {" "}available win/loss combinations
                evaluated.

                Owners whose qualification
                is still possible are listed below.

                Unresolved points tiebreakers
                are not treated as guaranteed results.
              </p>

              {!possibleOwners.length && (
                <p className="dp-muted">
                  No owner currently has an
                  unresolved modeled playoff berth.
                </p>
              )}

              {possibleOwners.map(t => {
                const ownerPaths =
                  exact.paths.get(t.ownerId) || [];

                const count =
                  shown[t.ownerId] || 15;

                const own = indexedGames.filter(
                  g =>
                    g.homeId === t.ownerId ||
                    g.awayId === t.ownerId
                );

                const groups = new Map();

                for (const path of ownerPaths) {
                  const key = own.map(g => {
                    const winner =
                      ((path.mask >> g.position) & 1)
                        ? g.homeId
                        : g.awayId;

                    return winner === t.ownerId
                      ? "W"
                      : "L";
                  }).join("") || "No games";

                  if (!groups.has(key)) {
                    groups.set(key, []);
                  }

                  groups.get(key).push(path);
                }

                return (
                  <details
                    className="dp-owner"
                    key={t.ownerId}
                  >
                    <summary>
                      <strong>{t.ownerName}</strong>

                      <span>
                        {ownerPaths.length.toLocaleString()}
                        {" "}qualifying/conditional outcomes
                      </span>
                    </summary>

                    <div className="dp-owner-body">
                      <p className="dp-muted">
                        Every qualifying path below
                        identifies the required results
                        for this owner and every
                        other owner.
                      </p>

                      {[...groups.entries()].map(
                        ([key, paths]) => (
                          <div
                            className="dp-group"
                            key={key}
                          >
                            <h3>
                              {key === "No games"
                                ? "No games remaining"
                                : `Your results: ${key.split("").join(" · ")}`}
                            </h3>

                            {own.map((g, i) => (
                              <div
                                className="dp-line"
                                key={g.id}
                              >
                                Week {g.week}:{" "}
                                <b>
                                  {key[i] === "W"
                                    ? "Beat"
                                    : "Lose to"}
                                  {" "}
                                  {byName(
                                    g.homeId === t.ownerId
                                      ? g.awayId
                                      : g.homeId
                                  )}
                                </b>
                              </div>
                            ))}

                            <p className="dp-muted">
                              {paths.length.toLocaleString()}
                              {" "}available outside-result
                              combinations for this finish.
                            </p>

                            {paths
                              .slice(0, count)
                              .map((path, index) => {
                                const matchingOthers =
                                  indexedGames.filter(
                                    g =>
                                      g.homeId !== t.ownerId &&
                                      g.awayId !== t.ownerId
                                  );

                                const state =
                                  copyTeams(teams);

                                const stateById =
                                  new Map(
                                    state.map(x => [
                                      x.ownerId,
                                      x
                                    ])
                                  );

                                indexedGames.forEach(
                                  g => apply(
                                    stateById,
                                    g,
                                    ((path.mask >> g.position) & 1)
                                      ? g.homeId
                                      : g.awayId
                                  )
                                );

                                const ownerState =
                                  stateById.get(t.ownerId);

                                const tied = state.filter(
                                  x =>
                                    x.ownerId !== t.ownerId &&
                                    winRate(x) ===
                                      winRate(ownerState) &&
                                    x.wins === ownerState.wins
                                );

                                return (
                                  <details
                                    className="dp-path"
                                    key={path.mask}
                                  >
                                    <summary>
                                      Path {index + 1}:{" "}
                                      {path.certain
                                        ? "Qualifies regardless of points tiebreakers"
                                        : "Needs points-tiebreaker help"}
                                    </summary>

                                    <div className="dp-path-body">
                                      <h4>
                                        Outside Help Required
                                        — Every Other Matchup
                                      </h4>

                                      {matchingOthers.length
                                        ? matchingOthers.map(g => {
                                            const winId =
                                              ((path.mask >> g.position) & 1)
                                                ? g.homeId
                                                : g.awayId;

                                            const loseId =
                                              winId === g.homeId
                                                ? g.awayId
                                                : g.homeId;

                                            return (
                                              <div
                                                className="dp-line"
                                                key={g.id}
                                              >
                                                <b>Week {g.week}:</b>
                                                {" "}
                                                {byName(winId)}
                                                {" "}must beat{" "}
                                                {byName(loseId)}
                                              </div>
                                            );
                                          })
                                        : (
                                          <p>
                                            No outside results
                                            are required.
                                          </p>
                                        )}

                                      <h4>
                                        Every Other Owner's
                                        Required Finish
                                      </h4>

                                      {teams
                                        .filter(
                                          x =>
                                            x.ownerId !== t.ownerId
                                        )
                                        .map(other => {
                                          const matches =
                                            indexedGames.filter(
                                              g =>
                                                g.homeId === other.ownerId ||
                                                g.awayId === other.ownerId
                                            );

                                          return (
                                            <div
                                              className="dp-line"
                                              key={other.ownerId}
                                            >
                                              <b>
                                                {other.ownerName}:
                                              </b>
                                              {" "}
                                              {matches.length
                                                ? matches.map(g => {
                                                    const winId =
                                                      ((path.mask >> g.position) & 1)
                                                        ? g.homeId
                                                        : g.awayId;

                                                    const opponentId =
                                                      g.homeId === other.ownerId
                                                        ? g.awayId
                                                        : g.homeId;

                                                    return `W${g.week} ${winId === other.ownerId ? "WIN" : "LOSS"} vs ${byName(opponentId)}`;
                                                  }).join("; ")
                                                : "No remaining games"}
                                            </div>
                                          );
                                        })}

                                      {tied.length > 0 && (
                                        <>
                                          <h4>
                                            Total Points
                                            Tiebreaker Targets
                                          </h4>

                                          <p className="dp-muted">
                                            Pairwise targets if
                                            total points scored
                                            is the applicable
                                            tiebreaker.

                                            Not every target
                                            is necessarily needed
                                            for the playoff berth.
                                          </p>

                                          {tied.map(other => (
                                            <div
                                              className="dp-line"
                                              key={other.ownerId}
                                            >
                                              {targetAgainst(
                                                t,
                                                other
                                              )}.
                                            </div>
                                          ))}
                                        </>
                                      )}

                                      {!path.certain && (
                                        <p className="dp-warning">
                                          This route may require
                                          winning a points tiebreaker.
                                          The berth cannot be
                                          guaranteed until future
                                          fantasy points are known.
                                        </p>
                                      )}
                                    </div>
                                  </details>
                                );
                              })}

                            {paths.length > count && (
                              <button
                                className="dp-more"
                                onClick={() =>
                                  setShown(old => ({
                                    ...old,
                                    [t.ownerId]: count + 15
                                  }))
                                }
                              >
                                Show 15 more exact outcomes
                                {" "}({paths.length - count} remaining
                                in this group)
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </details>
                );
              })}

              <p className="dp-muted">
                The model assumes two division
                champions receive automatic berths
                when two divisions are provided,
                with remaining spots awarded
                as wild cards.

                Because exact ESPN tiebreakers
                and full schedule coverage have
                not been independently verified,
                clinched and eliminated statuses
                are modeled classifications,
                not official league rulings.
              </p>
            </>
          )}
        </section>
      )}

      {/* STYLES */}

      <style jsx>{`
        .dp-root {
          display:flex;
          flex-direction:column;
          gap:22px;
          margin:24px 0 42px;
          color:#f4f5f7;
        }
        .dp-panel {
          background:#171d26;
          border:1px solid #303947;
          border-radius:13px;
          padding:20px;
          min-width:0;
        }
        .dp-panel h2 {
          font-size:23px;
          color:#fff;
          margin:6px 0 14px;
        }
        .dp-panel h3 {
          font-size:15px;
          color:#e9bd67;
          margin:14px 0 10px;
        }
        .dp-panel h4 {
          font-size:12px;
          color:#f1cf8b;
          margin:14px 0 8px;
        }
        .dp-heading,
        .dp-odds-top {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
        }
        .dp-kicker {
          font-size:10px;
          font-weight:900;
          color:#d7ad63;
          letter-spacing:1px;
        }
        .dp-muted,
        .dp-small {
          font-size:12px;
          line-height:1.65;
          color:#9fadc0;
        }
        .dp-odds {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        }
        .dp-odds-row {
          background:#242c38;
          border:1px solid #35404f;
          padding:14px;
          border-radius:9px;
          min-width:0;
        }
        .dp-odds-row small {
          color:#a7b3c1;
          font-size:10px;
          display:block;
          margin-top:7px;
        }
        .dp-progress {
          height:8px;
          background:#35404f;
          border-radius:99px;
          overflow:hidden;
          margin-top:11px;
        }
        .dp-progress div {
          height:100%;
          background:#d7ad63;
          border-radius:99px;
        }
        button {
          cursor:pointer;
        }
        .dp-week {
          border:1px solid #35404f;
          border-radius:9px;
          margin:8px 0;
          background:#202733;
          overflow:hidden;
        }
        .dp-week-head {
          width:100%;
          display:flex;
          justify-content:space-between;
          padding:15px;
          color:#fff;
          background:transparent;
          border:0;
        }
        .dp-week-body {
          padding:0 14px 14px;
        }
        .dp-game {
          display:grid;
          grid-template-columns:minmax(0,1fr) 22px minmax(0,1fr);
          align-items:center;
          gap:8px;
          padding:8px 0;
          border-top:1px solid #35404f;
        }
        .dp-game span {
          color:#9fadc0;
          text-align:center;
          font-size:11px;
        }
        .dp-game button {
          border-radius:7px;
          border:1px solid #465364;
          background:#2b3542;
          color:#e0e5ed;
          font-size:12px;
          padding:12px 6px;
          overflow-wrap:anywhere;
        }
        .dp-game button.active {
          background:#423922;
          border-color:#e9bd67;
          color:#f4cf8a;
        }
        .dp-buttons {
          display:flex;
          gap:10px;
          margin:16px 0;
        }
        .dp-buttons button,
        .dp-more {
          padding:11px 15px;
          border-radius:8px;
          border:1px solid #706143;
          background:#2c3440;
          color:#f4f5f7;
          font-weight:800;
          font-size:12px;
        }
        .dp-buttons .dp-gold {
          background:#d7ad63;
          color:#191d23;
        }
        .dp-results {
          margin-top:18px;
          border-top:1px solid #35404f;
          padding-top:12px;
        }
        .dp-result {
          display:grid;
          grid-template-columns:minmax(0,1fr) 70px 75px;
          gap:10px;
          padding:11px 0;
          border-bottom:1px solid #303947;
          font-size:12px;
        }
        .dp-result span {
          text-align:right;
        }
        .up {
          color:#65d39c;
        }
        .down {
          color:#e87d83;
        }
        .dp-owner {
          background:#202733;
          border:1px solid #35404f;
          border-radius:9px;
          margin:10px 0;
        }
        .dp-owner>summary {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          cursor:pointer;
          padding:16px;
        }
        .dp-owner>summary span {
          font-size:11px;
          color:#d7ad63;
          text-align:right;
        }
        .dp-owner-body {
          padding:0 15px 15px;
        }
        .dp-group {
          background:#171d26;
          border:1px solid #35404f;
          border-radius:9px;
          margin:12px 0;
          padding:13px;
        }
        .dp-line {
          border-bottom:1px solid #303947;
          padding:8px 0;
          font-size:12px;
          line-height:1.5;
          color:#d4dce5;
        }
        .dp-path {
          border:1px solid #3c4857;
          border-radius:8px;
          margin:8px 0;
          background:#222b37;
        }
        .dp-path summary {
          cursor:pointer;
          padding:11px;
          font-size:12px;
          color:#f2cc80;
          font-weight:800;
        }
        .dp-path-body {
          padding:0 12px 12px;
        }
        .dp-warning {
          font-size:12px;
          color:#f2c977;
          line-height:1.6;
        }
        .dp-more {
          margin:10px 0;
        }
        @media(max-width:620px) {
          .dp-odds {
            grid-template-columns:1fr;
          }
          .dp-panel {
            padding:14px;
          }
          .dp-panel h2 {
            font-size:20px;
          }
          .dp-owner>summary {
            flex-direction:column;
            align-items:flex-start;
          }
          .dp-owner>summary span {
            text-align:left;
          }
        }
      `}</style>
    </div>
  );
}
