
"use client";

import { useMemo, useState } from "react";
import { decodeOutcomeRows } from "../../lib/playoffOutcomeRows";
import TiebreakerPanel from "./TiebreakerPanel";

// DIRTY P PLAYOFF PREDICTOR

const REGULAR_SEASON_END_WEEK = 13;
// Show extended playoff paths from Rivalry Week onward.
const EXTENDED_SCENARIOS_START_WEEK = 11;
const PAGE_SIZE = 8;

// Below 3% = Long Shot
const LONG_SHOT_CUTOFF = 0.03;
// Ignore negligible differences when suggesting who to root for.
const NEGLIGIBLE_SWING = 0.01;
const SMALL_SWING = 0.03;

const pct = x =>
  `${(100 * (x || 0)).toFixed(1)}%`;

const qualified = kind => kind !== "out";

const label = kind =>
  kind === "clinch"
    ? "Berth guaranteed in this outcome"
    : kind === "hunt"
    ? "Possible berth — tiebreaker dependent"
    : "Eliminated in this outcome";

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
  byId,
  outcomeRows,
}) {
  const [finish, setFinish] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const [opened, setOpened] =
    useState(null);

  const entries = useMemo(
    () => decodeOutcomeRows(outcomeRows, teams, games, baseline.iterations),
    [outcomeRows, teams, games, baseline.iterations]
  );

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

  const paths = entries.filter(
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
      entries.map(describe)
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
    entries.filter(
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
      <div className="dp-detail-heading">
        <div>
          <span className="dp-detail-kicker">PLAYOFF PATH EXPLORER</span>
          <h3>What {owner.ownerName} Needs to Make the Playoffs</h3>
          <p className="dp-detail-subtitle">Explore the remaining possible finishes and the results that could put {owner.ownerName.split(" ")[0]} in the postseason.</p>
        </div>
        <div className="dp-detail-counter">
          <strong>{paths.length.toLocaleString()}</strong>
          <span>{baseline.exact ? "QUALIFYING COMBINATIONS" : "QUALIFYING SAMPLED PATHS"}</span>
        </div>
      </div>

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

      <div className="dp-filter-head">
        <strong>Filter by remaining record</strong>
        <span>W = win · L = loss</span>
      </div>
      <div className="dp-filters" role="group" aria-label="Filter playoff paths by remaining record">
        <button type="button"
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
            type="button"
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

      <div className="dp-results-summary">
        <span>SCENARIO RESULTS</span>
        <strong>{paths.length.toLocaleString()} {baseline.exact ? "qualifying combinations" : "qualifying sampled outcomes"}</strong>
        <small>Showing {paths.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, paths.length)} of {paths.length.toLocaleString()}</small>
      </div>

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
                type="button"
                aria-expanded={opened === index}
                className="dp-path-trigger"
                onClick={() =>
                  setOpened(
                    opened === index
                      ? null
                      : index
                  )
                }
              >
                <span className="dp-path-trigger-title">
                  <b>Scenario {index + 1}</b>
                  <small>
                    {label(
                      entry.kinds.get(
                        owner.ownerId
                      )
                    )}
                  </small>
                </span>

                <span className="dp-path-icon">
                  {opened === index ? "−" : "+"}
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
          <button type="button"
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

          <button type="button"
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

      <style jsx global>{`
        .dp-detail { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--dp-deep-line); color: var(--dp-ink); }
        .dp-detail * { box-sizing: border-box; }
        .dp-detail-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
        .dp-detail-kicker { color: var(--dp-gold); font-size: 11px; font-weight: 800; letter-spacing: 1.7px; }
        .dp-detail-heading h3 { color: var(--dp-ink); font-size: clamp(20px, 2.4vw, 27px); line-height: 1.3; margin: 9px 0 8px; }
        .dp-detail-subtitle { color: var(--dp-muted); font-size: 13px; line-height: 1.6; margin: 0; max-width: 550px; }
        .dp-detail-counter { display: flex; flex-direction: column; gap: 5px; padding: 14px 18px; background: var(--dp-raised); border: 1px solid var(--dp-deep-line); border-radius: 12px; min-width: 185px; }
        .dp-detail-counter strong { font-size: 29px; color: var(--dp-gold); line-height: 1.1; }
        .dp-detail-counter span { color: var(--dp-muted); font-size: 10px; font-weight: 800; letter-spacing: .8px; }
        .dp-detail .dp-warning { background: var(--dp-raised); border: 1px solid var(--dp-gold-line); color: var(--dp-gold); border-radius: 10px; padding: 13px 15px; font-size: 12px; line-height: 1.65; margin: 13px 0; }
        .dp-detail .dp-major { display: inline-block; color: var(--dp-green)!important; font-size: 14px!important; font-weight: 850; background: var(--dp-soft); border: 1px solid var(--dp-green-line); border-radius: 9px; padding: 10px 13px; margin: 9px 0 5px; }
        .dp-detail .dp-muted { color: var(--dp-muted); font-size: 12px; line-height: 1.6; }
        .dp-detail .dp-filter-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 24px; }
        .dp-detail .dp-filter-head strong { font-size: 13px; color: var(--dp-ink); }
        .dp-detail .dp-filter-head span { font-size: 11px; color: var(--dp-muted); }
        .dp-detail .dp-filters { display: flex; flex-wrap: wrap; gap: 9px; margin: 12px 0 22px; }
        .dp-detail .dp-filters button { appearance: none; background: var(--dp-strong); border: 1px solid var(--dp-deep-line); border-radius: 9px; color: var(--dp-ink); font-size: 12px; font-weight: 700; line-height: 1.3; padding: 10px 13px; min-height: 39px; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
        .dp-detail .dp-filters button:hover { background: var(--dp-strong); border-color: var(--dp-deep-line); }
        .dp-detail .dp-filters button.on { background: var(--dp-gold-bg); color: var(--dp-gold); border-color: var(--dp-gold-line); box-shadow: inset 0 0 0 1px #daac5838; }
        .dp-detail .dp-filters button:focus-visible, .dp-detail .dp-path-trigger:focus-visible, .dp-detail .dp-pagination button:focus-visible { outline: 2px solid var(--dp-gold-line); outline-offset: 2px; }
        .dp-detail .dp-results-summary { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px 16px; padding-bottom: 12px; border-bottom: 1px solid var(--dp-deep-line); margin: 4px 0 12px; }
        .dp-detail .dp-results-summary span { color: var(--dp-gold); letter-spacing: 1px; font-size: 10px; font-weight: 900; }
        .dp-detail .dp-results-summary strong { color: var(--dp-ink); font-size: 14px; }
        .dp-detail .dp-results-summary small { color: var(--dp-muted); font-size: 11px; }
        .dp-detail .dp-combinations { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 10px; margin-top: 12px; }
        .dp-detail .dp-path { border: 1px solid var(--dp-deep-line); border-radius: 12px; background: var(--dp-raised); overflow: hidden; min-width: 0; }
        .dp-detail .dp-path:has(.dp-path-trigger[aria-expanded="true"]) { border-color: var(--dp-gold-line); }
        .dp-detail .dp-path-trigger { width: 100%; background: transparent; border: 0; padding: 15px; color: var(--dp-ink); text-align: left; display: flex; justify-content: space-between; gap: 14px; align-items: center; cursor: pointer; }
        .dp-detail .dp-path-trigger:hover { background: var(--dp-strong); }
        .dp-detail .dp-path-trigger-title { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
        .dp-detail .dp-path-trigger-title b { font-size: 14px; color: var(--dp-ink); }
        .dp-detail .dp-path-trigger-title small { font-size: 11px; line-height: 1.4; color: var(--dp-gold); }
        .dp-detail .dp-path-icon { flex: 0 0 26px; height: 26px; display: flex; justify-content: center; align-items: center; color: var(--dp-gold); border: 1px solid var(--dp-deep-line); background: var(--dp-strong); border-radius: 50%; font-size: 18px; }
        .dp-detail .dp-path-body { background: var(--dp-soft); border-top: 1px solid var(--dp-deep-line); padding: 16px; font-size: 12px; }
        .dp-detail .dp-path-body b { display: block; color: var(--dp-gold); font-size: 12px; margin-top: 5px; }
        .dp-detail .dp-path-body p { color: var(--dp-ink); padding: 8px 0; border-bottom: 1px solid var(--dp-deep-line); margin: 2px 0; line-height: 1.5; }
        .dp-detail .dp-path-body b:not(:first-child) { margin-top: 19px; }
        .dp-detail .dp-path-body small { display: block; color: var(--dp-muted); margin-top: 15px; line-height: 1.5; }
        .dp-detail .dp-necessary { background: var(--dp-soft); border: 1px solid var(--dp-gold-line); border-radius: 10px; padding: 14px; margin: 12px 0 17px; }
        .dp-detail .dp-necessary b { color: var(--dp-gold); font-size: 13px; }
        .dp-detail .dp-necessary p { color: var(--dp-gold); font-size: 12px; margin: 9px 0 0; }
        .dp-detail .dp-pagination { display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap; margin: 21px 0 8px; font-size: 12px; color: var(--dp-ink); }
        .dp-detail .dp-pagination button { appearance: none; background: var(--dp-strong); border: 1px solid var(--dp-deep-line); border-radius: 9px; color: var(--dp-ink); padding: 10px 16px; min-width: 90px; font-size: 12px; font-weight: 750; cursor: pointer; }
        .dp-detail .dp-pagination button:disabled { cursor: not-allowed; opacity: .35; }
        @media (max-width: 780px) { .dp-detail .dp-combinations { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 520px) {
          .dp-detail-heading { flex-direction: column; }
          .dp-detail-counter { width: 100%; }
          .dp-detail .dp-filters { flex-wrap: nowrap; overflow-x: auto; padding: 3px 2px 12px; scrollbar-width: thin; }
          .dp-detail .dp-filters button { flex: 0 0 auto; }
          .dp-detail .dp-results-summary { flex-direction: column; }
        }
      `}</style>
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
  playoffCount = 4,
  completedGames = [],
  seedingRule = "",
  scenarios
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

  const baseline = useMemo(() => ({
    exact: scenarios.exact,
    iterations: scenarios.iterations,
    totals: new Map(scenarios.totals),
  }), [scenarios]);

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

  const report = owner && showSurvivalAdvice && week != null
    ? scenarios.reports[id]
    : null;

  const noGames =
    games.length === 0;

  return (
    <div className="dp-root">

      {/* ========================================
          1. PLAYOFF PERCENTAGES
      ======================================== */}

      <details className="dp-topic">
        <summary className="dp-topic-summary">
          <span><small>LEAGUE OUTLOOK</small><strong>Playoff Percentages</strong><em>ESPN's current postseason odds for every owner</em></span>
          <span className="dp-topic-arrow" aria-hidden="true">⌄</span>
        </summary>
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
      </details>

      {/* ========================================
          2. THIS WEEK: WHAT YOU NEED
      ======================================== */}

      <details className="dp-topic">
        <summary className="dp-topic-summary">
          <span><small>WEEK {currentWeek}</small><strong>Best Path This Week</strong><em>Who to root for and how each matchup changes your chances</em></span>
          <span className="dp-topic-arrow" aria-hidden="true">⌄</span>
        </summary>
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
      </details>

      {/* ========================================
          3. ROAD TO THE PLAYOFFS
      ======================================== */}

      <details className="dp-topic" open={true}>
        <summary className="dp-topic-summary">
          <span><small>POSTSEASON SCENARIOS</small><strong>Road to the Playoffs</strong><em>Paths to qualify, scenarios, and owner tiebreakers</em></span>
          <span className="dp-topic-arrow" aria-hidden="true">⌄</span>
        </summary>
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
            {baseline.iterations.toLocaleString()}
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
                    outcomeRows={scenarios.outcomeRows}
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
      </details>

      {/* ========================================
          STYLES
      ======================================== */}

      <style jsx>{`
        .dp-topic { background: var(--dp-raised); border: 1px solid var(--dp-deep-line); border-radius: 14px; overflow: hidden; min-width: 0; }
        .dp-topic[open] { border-color: var(--dp-deep-line); }
        .dp-topic-summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 19px 21px; background: var(--dp-raised); }
        .dp-topic-summary::-webkit-details-marker { display: none; }
        .dp-topic-summary:hover { background: var(--dp-strong); }
        .dp-topic-summary > span:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .dp-topic-summary small { color: var(--dp-gold); font-size: 10px; font-weight: 900; letter-spacing: 1.5px; font-style: normal; }
        .dp-topic-summary strong { color: var(--dp-ink); font-size: clamp(17px, 2.5vw, 22px); font-weight: 850; }
        .dp-topic-summary em { color: var(--dp-muted); font-size: 12px; font-style: normal; line-height: 1.5; }
        .dp-topic-arrow { flex: 0 0 34px; width: 34px; height: 34px; border: 1px solid var(--dp-deep-line); border-radius: 50%; color: var(--dp-gold); background: var(--dp-strong); display: grid; place-items: center; font-size: 24px; transition: transform .15s; }
        .dp-topic[open] .dp-topic-arrow { transform: rotate(180deg); }
        .dp-topic > .dp-panel { border: 0; border-top: 1px solid var(--dp-deep-line); border-radius: 0; margin: 0; }
        .dp-topic-summary:focus-visible { outline: 2px solid var(--dp-gold-line); outline-offset: -3px; }
        @media(max-width: 550px) { .dp-topic-summary { padding: 15px; } .dp-topic-summary em { font-size: 11px; } }
        .dp-root {
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin: 22px 0 45px;
          color: var(--dp-ink);
        }

        .dp-panel.dp-road-panel {
          background: linear-gradient(165deg, var(--dp-raised) 0%, var(--dp-white) 68%);
          border-color: var(--dp-deep-line);
        }
        .dp-road-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--dp-deep-line);
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
          background: var(--dp-soft);
          border: 1px solid var(--dp-deep-line);
          border-radius: 12px;
        }
        .dp-road-probability span, .dp-road-label {
          color: var(--dp-muted);
          font-weight: 800;
          letter-spacing: 1.2px;
          font-size: 10px;
        }
        .dp-road-probability strong {
          font-size: 33px;
          line-height: 1.1;
          color: var(--dp-gold);
        }
        .dp-road-probability small {
          color: var(--dp-muted);
          font-size: 11px;
        }
        .dp-road-report {
          background: var(--dp-raised);
          border-color: var(--dp-deep-line);
          padding: 20px;
        }
        .dp-road-owner-heading {
          padding-bottom: 13px;
          border-bottom: 1px solid var(--dp-deep-line);
        }
        .dp-road-owner-heading h3 {
          margin: 5px 0;
          font-size: 21px;
        }
        .dp-road-stat {
          background: var(--dp-soft);
          border-color: var(--dp-deep-line);
          border-radius: 11px;
          padding: 16px 7px;
        }
        .dp-road-stat strong {
          font-size: clamp(20px, 4vw, 30px);
        }
        .dp-road-stat span {
          color: var(--dp-muted);
          font-size: 10px;
        }
        .dp-panel {
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
          padding: 20px;
          min-width: 0;
        }

        .dp-kicker {
          color: var(--dp-gold);
          letter-spacing: 1.2px;
          font-size: 10px;
          font-weight: 900;
        }

        .dp-panel h2 {
          font-size: 23px;
          margin: 8px 0 12px;
          color: var(--dp-ink);
        }

        .dp-panel h3 {
          font-size: 18px;
          margin: 8px 0;
          color: var(--dp-gold);
        }

        .dp-panel h4 {
          font-size: 14px;
          margin: 20px 0 10px;
          color: var(--dp-gold);
        }

        .dp-muted {
          font-size: 12px;
          color: var(--dp-muted);
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
          color: var(--dp-gold);
        }

        .dp-good {
          color: var(--dp-green);
        }

        .dp-bad {
          color: var(--dp-red);
        }

        .dp-odds-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 15px 0;
        }

        .dp-odds {
          background: var(--dp-raised);
          border: 1px solid var(--dp-deep-line);
          padding: 14px;
          border-radius: 9px;
          font-size: 12px;
        }

        .dp-odds small {
          display: block;
          margin-top: 9px;
          color: var(--dp-muted);
          font-size: 10px;
        }

        .dp-track {
          background: var(--dp-strong);
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
          background: var(--dp-strong);
          color: var(--dp-ink);
          border: 1px solid var(--dp-gold-line);
          border-radius: 9px;
        }

        .dp-report {
          background: var(--dp-raised);
          border: 1px solid var(--dp-deep-line);
          border-radius: 11px;
          padding: 17px;
          margin: 10px 0;
        }

        .dp-report p {
          font-size: 12px;
          line-height: 1.7;
        }

        .dp-pill {
          background: var(--dp-raised);
          color: var(--dp-gold);
          border: 1px solid var(--dp-gold-line);
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
          background: var(--dp-soft);
          border: 1px solid var(--dp-deep-line);
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
          color: var(--dp-muted);
        }

        .dp-watch {
          border-bottom:
            1px solid var(--dp-deep-line);
          padding: 10px 0;
        }

        .dp-watch b {
          font-size: 12px;
        }

        .dp-watch p {
          margin: 7px 0;
        }

        .dp-details {
          border: 1px solid var(--dp-deep-line);
          border-radius: 9px;
          padding: 12px;
          margin-top: 12px;
          background: var(--dp-soft);
        }

        .dp-details summary {
          cursor: pointer;
          color: var(--dp-gold);
          font-size: 12px;
          font-weight: 800;
        }

        .dp-details p {
          margin: 8px 0;
        }

        .dp-necessary {
          padding: 14px;
          border: 1px solid var(--dp-deep-line);
          border-radius: 9px;
          background: var(--dp-raised);
          margin: 14px 0;
        }

        .dp-necessary b {
          color: var(--dp-gold);
          font-size: 12px;
        }

        .dp-necessary p,
        .dp-necessary small {
          font-size: 11px;
          color: var(--dp-ink);
        }

        .dp-stack {
          height: 10px;
          display: flex;
          overflow: hidden;
          border-radius: 20px;
          margin: 16px 0;
          background: var(--dp-strong);
        }

        .dp-stack div {
          height: 100%;
        }

        .dp-locked {
          background: var(--dp-raised);
          border: 1px solid var(--dp-gold-line);
          border-radius: 9px;
          padding: 15px;
          margin-top: 16px;
        }

        .dp-locked b {
          font-size: 12px;
          color: var(--dp-gold);
        }

        .dp-locked p {
          font-size: 12px;
          color: var(--dp-gold);
        }

        .dp-warning {
          padding: 13px;
          background: var(--dp-raised);
          border: 1px solid var(--dp-gold-line);
          border-radius: 9px;
          color: var(--dp-gold);
          font-size: 12px;
          line-height: 1.7;
        }

        .dp-detail {
          margin-top: 20px;
          border-top:
            1px solid var(--dp-deep-line);
          padding-top: 12px;
        }

        .dp-major {
          font-size: 14px !important;
          font-weight: 900;
          color: var(--dp-green) !important;
        }

        .dp-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 15px 0;
        }

        .dp-filters button,
        .dp-pagination button {
          background: var(--dp-strong);
          border: 1px solid var(--dp-deep-line);
          border-radius: 8px;
          color: var(--dp-ink);
          padding: 10px;
          font-size: 11px;
          cursor: pointer;
        }

        .dp-filters button.on {
          border-color: var(--dp-gold-line);
          color: var(--dp-gold);
          background: var(--dp-raised);
        }

        .dp-path {
          background: var(--dp-soft);
          border: 1px solid var(--dp-deep-line);
          border-radius: 9px;
          margin: 8px 0;
          overflow: hidden;
        }

        .dp-path-trigger {
          width: 100%;
          padding: 13px;
          background: transparent;
          border: 0;
          color: var(--dp-ink);
          display: flex;
          justify-content:
            space-between;
          text-align: left;
          cursor: pointer;
        }

        .dp-path-trigger small {
          display: block;
          color: var(--dp-gold);
          margin-top: 5px;
        }

        .dp-path-body {
          padding: 13px;
          border-top:
            1px solid var(--dp-deep-line);
          font-size: 12px;
        }

        .dp-path-body b {
          color: var(--dp-gold);
        }

        .dp-path-body p {
          border-bottom:
            1px solid var(--dp-deep-line);
          padding: 5px 0;
        }

        .dp-path-body small {
          color: var(--dp-muted);
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
