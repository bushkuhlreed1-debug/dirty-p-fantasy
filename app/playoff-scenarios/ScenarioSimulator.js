
"use client";

import { useMemo, useState } from "react";

// ==================================================
// DIRTY P PLAYOFF PREDICTOR
// ==================================================

const REGULAR_SEASON_END_WEEK = 14;
const EXACT_LIMIT = 14;
const SIMULATIONS = 25000;
const PAGE_SIZE = 8;

const COLORS = {
  clinch: "#58cb98",
  hunt: "#e7ba65",
  out: "#e47e83"
};

const num = value => Number(value) || 0;
const pct = value =>
  `${((value || 0) * 100).toFixed(1)}%`;

const gamesPlayed = team =>
  num(team.wins) +
  num(team.losses) +
  num(team.ties);

const winPct = team =>
  gamesPlayed(team)
    ? (
        num(team.wins) +
        num(team.ties) / 2
      ) / gamesPlayed(team)
    : 0.5;

const alive = category =>
  category !== "out";

const ownerName = (byId, id) =>
  byId.get(id)?.ownerName || "Unknown Owner";

// ==================================================
// STANDINGS / PLAYOFF QUALIFICATION
// ==================================================

function playoffField(
  teams,
  playoffCount,
  targetId = null,
  preference = 0
) {
  const compare = (a, b) => {
    const record =
      winPct(b) - winPct(a) ||
      num(b.wins) - num(a.wins);

    if (Math.abs(record) > 1e-9) {
      return record;
    }

    if (
      targetId !== null &&
      preference &&
      (
        a.ownerId === targetId ||
        b.ownerId === targetId
      )
    ) {
      return a.ownerId === targetId
        ? -preference
        : preference;
    }

    return (
      num(b.pointsFor) -
        num(a.pointsFor) ||
      String(a.ownerName).localeCompare(
        String(b.ownerName)
      )
    );
  };

  const divisions = new Map();

  for (const team of teams) {
    if (
      team.divisionId === null ||
      team.divisionId === undefined ||
      team.divisionId === ""
    ) {
      continue;
    }

    const key = String(team.divisionId);

    if (!divisions.has(key)) {
      divisions.set(key, []);
    }

    divisions.get(key).push(team);
  }

  const hasTwoDivisions =
    divisions.size === 2 &&
    teams.every(
      team =>
        team.divisionId !== null &&
        team.divisionId !== undefined &&
        team.divisionId !== ""
    );

  if (!hasTwoDivisions) {
    return new Set(
      [...teams]
        .sort(compare)
        .slice(0, playoffCount)
        .map(team => team.ownerId)
    );
  }

  const champions = [...divisions.values()]
    .map(
      group =>
        [...group].sort(compare)[0]
    )
    .sort(compare)
    .slice(0, playoffCount);

  const championIds = new Set(
    champions.map(team => team.ownerId)
  );

  const wildcards = teams
    .filter(
      team => !championIds.has(team.ownerId)
    )
    .sort(compare)
    .slice(
      0,
      Math.max(
        0,
        playoffCount - champions.length
      )
    );

  return new Set(
    [...champions, ...wildcards].map(
      team => team.ownerId
    )
  );
}

// ==================================================
// SCENARIO CATEGORY
//
// CLINCH = qualifies with an unfavorable
//          modeled points tiebreaker
//
// HUNT = qualification is possible but
//        depends on the tiebreaker
//
// OUT = cannot qualify in that combination
// ==================================================

function classify(
  teams,
  playoffCount,
  unknownFutureScoring
) {
  const nominal = playoffField(
    teams,
    playoffCount
  );

  const categories = new Map();

  for (const team of teams) {
    const id = team.ownerId;

    if (!unknownFutureScoring) {
      categories.set(
        id,
        nominal.has(id) ? "clinch" : "out"
      );

      continue;
    }

    const possible = playoffField(
      teams,
      playoffCount,
      id,
      1
    ).has(id);

    if (!possible) {
      categories.set(id, "out");
      continue;
    }

    const guaranteed = playoffField(
      teams,
      playoffCount,
      id,
      -1
    ).has(id);

    categories.set(
      id,
      guaranteed ? "clinch" : "hunt"
    );
  }

  return { nominal, categories };
}

// ==================================================
// APPLY GAME RESULTS
// ==================================================

function applyResults(
  teams,
  games,
  winners
) {
  const updated = teams.map(
    team => ({ ...team })
  );

  const byId = new Map(
    updated.map(team => [
      team.ownerId,
      team
    ])
  );

  games.forEach((game, index) => {
    const home = byId.get(game.homeId);
    const away = byId.get(game.awayId);

    if (!home || !away) return;

    if (winners[index] === game.homeId) {
      home.wins = num(home.wins) + 1;
      away.losses = num(away.losses) + 1;
    } else {
      away.wins = num(away.wins) + 1;
      home.losses = num(home.losses) + 1;
    }
  });

  return updated;
}

// ==================================================
// MATCHUP PROBABILITY
// ==================================================

function winChance(a, b) {
  if (!a || !b) return 0.5;

  const strength = team => {
    const played = gamesPlayed(team);

    const avg = played
      ? num(team.pointsFor) / played
      : 100;

    return (
      played / (played + 4)
    ) * (
      0.33 * (winPct(team) - 0.5) +
      Math.max(
        -0.15,
        Math.min(
          0.15,
          (avg - 100) / 270
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

function seededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (
      state + 0x6d2b79f5
    ) >>> 0;

    let x = state;

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

// ==================================================
// PLAYOFF SIMULATIONS
// ==================================================

function calculatePlayoffs(
  teams,
  games,
  playoffCount,
  season
) {
  const exact =
    games.length <= EXACT_LIMIT;

  const totalRuns = exact
    ? 2 ** games.length
    : SIMULATIONS;

  const random = seededRandom(
    92573 + num(season)
  );

  const byId = new Map(
    teams.map(team => [
      team.ownerId,
      team
    ])
  );

  const chances = games.map(game =>
    winChance(
      byId.get(game.homeId),
      byId.get(game.awayId)
    )
  );

  const totals = new Map(
    teams.map(team => [
      team.ownerId,
      {
        clinch: 0,
        hunt: 0,
        out: 0,
        possible: 0,
        weightedPlayoffs: 0,
        odds: 0
      }
    ])
  );

  const entries = [];
  let totalWeight = 0;

  for (
    let run = 0;
    run < totalRuns;
    run++
  ) {
    const winners = [];
    let weight = 1;

    for (
      let i = 0;
      i < games.length;
      i++
    ) {
      const homeWins = exact
        ? Boolean(run & (1 << i))
        : random() < chances[i];

      winners.push(
        homeWins
          ? games[i].homeId
          : games[i].awayId
      );

      if (exact) {
        weight *= homeWins
          ? chances[i]
          : 1 - chances[i];
      }
    }

    const updated = applyResults(
      teams,
      games,
      winners
    );

    const result = classify(
      updated,
      playoffCount,
      games.length > 0
    );

    totalWeight += weight;

    for (const team of teams) {
      const stats = totals.get(
        team.ownerId
      );

      const category = result.categories.get(
        team.ownerId
      );

      stats[category]++;

      if (alive(category)) {
        stats.possible++;
      }

      if (
        result.nominal.has(team.ownerId)
      ) {
        stats.weightedPlayoffs += weight;
      }
    }

    entries.push({
      winners,
      categories: result.categories,
      nominal: result.nominal,
      weight
    });
  }

  for (const stats of totals.values()) {
    stats.odds = totalWeight
      ? stats.weightedPlayoffs / totalWeight
      : 0;
  }

  return {
    exact,
    totalRuns,
    totals,
    entries
  };
}

// ==================================================
// CONDITIONAL ODDS
// ==================================================

function oddsGivenWinner(
  entries,
  gameIndex,
  winnerId,
  ownerId
) {
  let total = 0;
  let playoffWeight = 0;

  for (const entry of entries) {
    if (
      entry.winners[gameIndex] !== winnerId
    ) {
      continue;
    }

    total += entry.weight;

    if (entry.nominal.has(ownerId)) {
      playoffWeight += entry.weight;
    }
  }

  return total
    ? playoffWeight / total
    : null;
}

// ==================================================
// WEEKLY OWNER REPORT
// ==================================================

function buildWeeklyReport(
  ownerId,
  games,
  model,
  currentWeek
) {
  const weeklyGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game => game.week === currentWeek
    );

  const ownGame = weeklyGames.find(
    game =>
      game.homeId === ownerId ||
      game.awayId === ownerId
  );

  const opponentId = ownGame
    ? ownGame.homeId === ownerId
      ? ownGame.awayId
      : ownGame.homeId
    : null;

  const winOdds = ownGame
    ? oddsGivenWinner(
        model.entries,
        ownGame.index,
        ownerId,
        ownerId
      )
    : null;

  const lossOdds = ownGame
    ? oddsGivenWinner(
        model.entries,
        ownGame.index,
        opponentId,
        ownerId
      )
    : null;

  const possibleEntries = model.entries.filter(
    entry =>
      alive(
        entry.categories.get(ownerId)
      )
  );

  const winPossible = ownGame
    ? possibleEntries.some(
        entry =>
          entry.winners[ownGame.index] ===
          ownerId
      )
    : false;

  const lossPossible = ownGame
    ? possibleEntries.some(
        entry =>
          entry.winners[ownGame.index] ===
          opponentId
      )
    : false;

  const winOutcomes = ownGame
    ? model.entries.filter(
        entry =>
          entry.winners[ownGame.index] ===
          ownerId
      )
    : [];

  const winGuarantees = (
    model.exact &&
    winOutcomes.length > 0 &&
    winOutcomes.every(
      entry =>
        entry.categories.get(ownerId) ===
        "clinch"
    )
  );

  let headline = "Playoff race remains open";

  if (model.exact && ownGame) {
    if (!winPossible && !lossPossible) {
      headline =
        "No remaining modeled playoff path";
    } else if (winGuarantees) {
      headline =
        "Win and you're in";
    } else if (
      winPossible &&
      !lossPossible
    ) {
      headline =
        "Must win this week";
    } else if (lossPossible) {
      headline =
        "Can survive a loss";
    }
  }

  const otherGames = weeklyGames.filter(
    game => game !== ownGame
  );

  const rootingGuide = otherGames
    .map(game => {
      const homeOdds = oddsGivenWinner(
        model.entries,
        game.index,
        game.homeId,
        ownerId
      );

      const awayOdds = oddsGivenWinner(
        model.entries,
        game.index,
        game.awayId,
        ownerId
      );

      const homePossible = possibleEntries.some(
        entry =>
          entry.winners[game.index] ===
          game.homeId
      );

      const awayPossible = possibleEntries.some(
        entry =>
          entry.winners[game.index] ===
          game.awayId
      );

      const mustWin = (
        model.exact &&
        homePossible !== awayPossible
      )
        ? homePossible
          ? game.homeId
          : game.awayId
        : null;

      const preferredWinner =
        (homeOdds ?? 0) >=
        (awayOdds ?? 0)
          ? game.homeId
          : game.awayId;

      return {
        ...game,
        preferredWinner,
        mustWin,
        impact: Math.abs(
          (homeOdds ?? 0) -
          (awayOdds ?? 0)
        )
      };
    })
    .sort(
      (a, b) =>
        b.impact - a.impact
    );

  // Group simulated seasons by this week's
  // exact combination of game winners.
  const combinations = new Map();

  for (const entry of model.entries) {
    const winners = weeklyGames.map(
      game => entry.winners[game.index]
    );

    const key = winners.join("|");

    if (!combinations.has(key)) {
      combinations.set(key, {
        winners,
        total: 0,
        playoffWeight: 0
      });
    }

    const group = combinations.get(key);

    group.total += entry.weight;

    if (entry.nominal.has(ownerId)) {
      group.playoffWeight += entry.weight;
    }
  }

  const weeklyScenarios = [
    ...combinations.values()
  ].map(group => ({
    ...group,
    odds: group.total
      ? group.playoffWeight / group.total
      : 0
  }));

  weeklyScenarios.sort(
    (a, b) => a.odds - b.odds
  );

  return {
    ownGame,
    opponentId,
    winOdds,
    lossOdds,
    headline,
    rootingGuide,
    weeklyGames,
    worst: weeklyScenarios[0] || null,
    best:
      weeklyScenarios[
        weeklyScenarios.length - 1
      ] || null
  };
}

// ==================================================
// FINAL TWO WEEKS: QUALIFYING COMBINATIONS
// ==================================================

function FinalWeekPaths({
  owner,
  teams,
  games,
  model,
  byId
}) {
  const [finish, setFinish] = useState("all");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(null);

  const ownGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId === owner.ownerId ||
        game.awayId === owner.ownerId
    );

  function finishPattern(entry) {
    return ownGames
      .map(game =>
        entry.winners[game.index] ===
        owner.ownerId
          ? "W"
          : "L"
      )
      .join("");
  }

  const qualifying = model.entries.filter(
    entry =>
      alive(
        entry.categories.get(owner.ownerId)
      )
  );

  const finishes = [
    ...new Set(
      model.entries.map(finishPattern)
    )
  ].sort((a, b) => {
    const aWins = (
      a.match(/W/g) || []
    ).length;

    const bWins = (
      b.match(/W/g) || []
    ).length;

    return (
      bWins - aWins ||
      a.localeCompare(b)
    );
  });

  const finishCounts = new Map(
    finishes.map(pattern => [
      pattern,
      qualifying.filter(
        entry =>
          finishPattern(entry) === pattern
      ).length
    ])
  );

  const possibleFinishes = finishes.filter(
    pattern =>
      finishCounts.get(pattern) > 0
  );

  const minimumWins = possibleFinishes.length
    ? Math.min(
        ...possibleFinishes.map(
          pattern =>
            (
              pattern.match(/W/g) || []
            ).length
        )
      )
    : null;

  const mustWinOut =
    minimumWins === ownGames.length;

  const paths = qualifying.filter(
    entry =>
      finish === "all" ||
      finishPattern(entry) === finish
  );

  // Identify outside game results shared
  // by every currently selected qualifying path.
  const outsideGames = games
    .map((game, index) => ({
      ...game,
      index
    }))
    .filter(
      game =>
        game.homeId !== owner.ownerId &&
        game.awayId !== owner.ownerId
    );

  const requiredOutside = outsideGames
    .map(game => {
      if (!paths.length) return null;

      const winner =
        paths[0].winners[game.index];

      return paths.every(
        entry =>
          entry.winners[game.index] ===
          winner
      )
        ? { ...game, winner }
        : null;
    })
    .filter(Boolean);

  const totalPages = Math.max(
    1,
    Math.ceil(paths.length / PAGE_SIZE)
  );

  const safePage = Math.min(
    page,
    totalPages
  );

  const visible = paths.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const name = id =>
    ownerName(byId, id);

  return (
    <div className="final-paths">

      <h3>
        What {owner.ownerName} Needs
        to Make the Playoffs
      </h3>

      {minimumWins === null ? (
        <p className="path-headline">
          NO REMAINING QUALIFYING PATH
        </p>
      ) : mustWinOut ? (
        <p className="path-headline">
          MUST WIN OUT
        </p>
      ) : minimumWins === 0 ? (
        <p className="path-headline">
          CAN STILL QUALIFY WITHOUT
          ANOTHER WIN
        </p>
      ) : (
        <p className="path-headline">
          AT LEAST {minimumWins} MORE{" "}
          {minimumWins === 1
            ? "WIN"
            : "WINS"}
          {" "}NEEDED IN A POSSIBLE PATH
        </p>
      )}

      <p className="muted">
        This is the minimum needed in
        at least one qualifying combination.
        It does not automatically guarantee
        a playoff berth.
      </p>

      <h4>Choose Your Finish</h4>

      <div className="finish-buttons">
        <button
          className={
            finish === "all" ? "active" : ""
          }
          onClick={() => {
            setFinish("all");
            setPage(1);
            setOpened(null);
          }}
        >
          All
        </button>

        {finishes.map(pattern => {
          const wins = (
            pattern.match(/W/g) || []
          ).length;

          const losses = (
            pattern.match(/L/g) || []
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
                setOpened(null);
              }}
            >
              {wins}-{losses}
              {" ("}{pattern}{")"}
              {" · "}
              {finishCounts.get(pattern)}
            </button>
          );
        })}
      </div>

      <div className="path-total">
        <strong>
          {paths.length.toLocaleString()}
        </strong>

        <span>
          Qualifying combinations
          matching this finish
        </span>
      </div>

      {requiredOutside.length > 0 && (
        <div className="required-results">
          <strong>
            Results Required in Every
            Qualifying Combination Shown
          </strong>

          {requiredOutside.map(game => (
            <p key={game.id}>
              Week {game.week}:{" "}
              <b>
                {name(game.winner)}
              </b>
              {" must beat "}
              {name(
                game.winner === game.homeId
                  ? game.awayId
                  : game.homeId
              )}
            </p>
          ))}
        </div>
      )}

      {paths.length > 0 && (
        <h4>Explore Qualifying Combinations</h4>
      )}

      {visible.map((entry, index) => {
        const number =
          (safePage - 1) * PAGE_SIZE +
          index +
          1;

        const isOpen = opened === number;

        const own = [];
        const outside = [];

        games.forEach((game, i) => {
          const winner = entry.winners[i];

          const loser =
            winner === game.homeId
              ? game.awayId
              : game.homeId;

          const line = {
            id: game.id,
            text:
              `Week ${game.week}: ` +
              `${name(winner)} beats ${name(loser)}`
          };

          if (
            game.homeId === owner.ownerId ||
            game.awayId === owner.ownerId
          ) {
            own.push(line);
          } else {
            outside.push(line);
          }
        });

        return (
          <div
            className="combination"
            key={number}
          >
            <button
              className="combination-toggle"
              onClick={() =>
                setOpened(
                  isOpen ? null : number
                )
              }
            >
              <span>
                <b>
                  Combination {number}
                </b>

                <small>
                  {entry.categories.get(
                    owner.ownerId
                  ) === "clinch"
                    ? "Guaranteed berth in this modeled outcome"
                    : "Possible berth"}
                </small>
              </span>

              <span>
                {isOpen ? "−" : "+"}
              </span>
            </button>

            {isOpen && (
              <div className="combination-content">
                <h4>Your Games</h4>

                {own.map(item => (
                  <p key={item.id}>
                    {item.text}
                  </p>
                ))}

                <h4>Other Results</h4>

                {outside.map(item => (
                  <p key={item.id}>
                    {item.text}
                  </p>
                ))}

                <small>
                  This is one complete
                  qualifying combination.
                  Other combinations may
                  also result in a berth.
                </small>
              </div>
            )}
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={safePage === 1}
            onClick={() => {
              setPage(safePage - 1);
              setOpened(null);
            }}
          >
            Previous
          </button>

          <span>
            Page {safePage} of {totalPages}
          </span>

          <button
            disabled={
              safePage === totalPages
            }
            onClick={() => {
              setPage(safePage + 1);
              setOpened(null);
            }}
          >
            Next
          </button>
        </div>
      )}

      <style jsx>{`
        .final-paths {
          border-top: 1px solid #3b4655;
          margin-top: 20px;
          padding-top: 16px;
        }

        .final-paths h3,
        .final-paths h4 {
          color: #e7ba65;
        }

        .final-paths h3 {
          font-size: 18px;
        }

        .final-paths h4 {
          font-size: 13px;
          margin-top: 20px;
        }

        .path-headline {
          color: #58cb98;
          font-size: 16px;
          font-weight: 900;
        }

        .muted {
          color: #acb8c6;
          font-size: 12px;
          line-height: 1.7;
        }

        .finish-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 14px 0;
        }

        .finish-buttons button {
          background: #283544;
          border: 1px solid #536172;
          border-radius: 8px;
          color: white;
          padding: 10px;
          font-size: 11px;
          cursor: pointer;
        }

        .finish-buttons button.active {
          border-color: #e7ba65;
          background: #403720;
          color: #e7ba65;
        }

        .path-total {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0;
        }

        .path-total strong {
          color: #e7ba65;
          font-size: 25px;
        }

        .path-total span {
          color: #acb8c6;
          font-size: 12px;
        }

        .required-results {
          background: #30291f;
          border: 1px solid #806539;
          border-radius: 9px;
          padding: 14px;
          margin: 15px 0;
        }

        .required-results strong {
          color: #e7ba65;
          font-size: 12px;
        }

        .required-results p {
          font-size: 12px;
          line-height: 1.6;
        }

        .combination {
          background: #171d26;
          border: 1px solid #384454;
          border-radius: 9px;
          margin: 9px 0;
          overflow: hidden;
        }

        .combination-toggle {
          background: transparent;
          color: #fff;
          border: 0;
          padding: 14px;
          width: 100%;
          display: flex;
          justify-content: space-between;
          text-align: left;
          cursor: pointer;
        }

        .combination-toggle small {
          color: #e7ba65;
          display: block;
          margin-top: 6px;
        }

        .combination-content {
          border-top: 1px solid #384454;
          padding: 14px;
        }

        .combination-content p {
          color: #d8e0e8;
          border-bottom: 1px solid #384454;
          padding: 7px 0;
          font-size: 12px;
        }

        .combination-content small {
          color: #acb8c6;
          font-size: 11px;
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 16px;
          gap: 10px;
          font-size: 12px;
        }

        .pagination button {
          background: #283544;
          border: 1px solid #806539;
          color: #e7ba65;
          border-radius: 8px;
          padding: 10px;
          cursor: pointer;
        }

        .pagination button:disabled {
          opacity: 0.3;
          cursor: default;
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
  season = 2026,
  playoffCount = 4
}) {
  const [selection, setSelection] =
    useState("");

  const byId = useMemo(
    () =>
      new Map(
        teams.map(team => [
          team.ownerId,
          team
        ])
      ),
    [teams]
  );

  const name = id =>
    ownerName(byId, id);

  const baseline = useMemo(
    () =>
      calculatePlayoffs(
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

  const finalTwoWeeks =
    currentWeek >=
      REGULAR_SEASON_END_WEEK - 1 &&
    currentWeek <=
      REGULAR_SEASON_END_WEEK;

  const availableWeeks = [
    ...new Set(
      games.map(game => game.week)
    )
  ].sort((a, b) => a - b);

  const nextWeek = availableWeeks.find(
    week => week >= currentWeek
  );

  const eligibleOwners = [...teams]
    .filter(team => {
      const stats = baseline.totals.get(
        team.ownerId
      );

      if (!stats) return false;

      if (!baseline.exact) {
        // A sampled result cannot prove
        // that an owner is eliminated.
        return true;
      }

      return (
        stats.possible > 0 &&
        stats.clinch < baseline.totalRuns
      );
    })
    .sort(
      (a, b) =>
        String(a.ownerName).localeCompare(
          String(b.ownerName)
        )
    );

  const requestedId = Number(selection);

  const selectedId = eligibleOwners.some(
    team => team.ownerId === requestedId
  )
    ? requestedId
    : eligibleOwners[0]?.ownerId;

  const owner = byId.get(selectedId);

  const selectedStats = baseline.totals.get(
    selectedId
  );

  const report = useMemo(
    () =>
      owner && nextWeek !== undefined
        ? buildWeeklyReport(
            selectedId,
            games,
            baseline,
            nextWeek
          )
        : null,
    [
      owner,
      selectedId,
      games,
      baseline,
      nextWeek
    ]
  );

  return (
    <div className="dp-root">

      {/* SECTION 1: PLAYOFF PERCENTAGES */}

      <section className="dp-panel">
        <span className="dp-kicker">
          DIRTY P ANALYTICS
        </span>

        <h2>Playoff Percentages</h2>

        <p className="dp-muted">
          Estimated playoff chances based on
          current records and remaining games.
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
            .map(team => {
              const stats =
                baseline.totals.get(
                  team.ownerId
                );

              return (
                <div
                  className="dp-odds-card"
                  key={team.ownerId}
                >
                  <div className="dp-between">
                    <b>
                      {team.ownerName}
                    </b>

                    <b className="dp-gold">
                      {pct(stats.odds)}
                    </b>
                  </div>

                  <div className="dp-track">
                    <div
                      style={{
                        width: `${
                          stats.odds * 100
                        }%`
                      }}
                    />
                  </div>

                  <small>
                    {stats.possible.toLocaleString()}
                    {" of "}
                    {baseline.totalRuns.toLocaleString()}
                    {" "}
                    outcomes preserve a
                    playoff path
                  </small>
                </div>
              );
            })}
        </div>

        <p className="dp-muted">
          {baseline.exact
            ? `All ${baseline.totalRuns.toLocaleString()} remaining win/loss combinations evaluated.`
            : `${SIMULATIONS.toLocaleString()} simulated seasons.`}
          {" "}Percentages are projections,
          not official ESPN odds.
        </p>
      </section>

      {/* SECTION 2: THIS WEEK */}

      <section className="dp-panel">
        <span className="dp-kicker">
          WEEKLY PLAYOFF GUIDE
        </span>

        <h2>This Week: What You Need</h2>

        <p className="dp-muted">
          Find out what happens if you
          win or lose and who you should
          root for this week.
        </p>

        {owner ? (
          <>
            <select
              className="dp-select"
              value={selectedId}
              onChange={event =>
                setSelection(
                  event.target.value
                )
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

            {report && (
              <div className="dp-report">

                <div className="dp-between">
                  <h3>
                    {owner.ownerName}
                    {" · Week "}
                    {nextWeek}
                  </h3>

                  <span className="dp-status">
                    {baseline.exact
                      ? report.headline
                      : "Projected Outlook"}
                  </span>
                </div>

                {report.ownGame ? (
                  <>
                    <p className="dp-muted">
                      Playing{" "}
                      <b>
                        {name(report.opponentId)}
                      </b>
                      {" "}this week.
                    </p>

                    <div className="dp-two-grid">
                      <div className="dp-stat">
                        <small>
                          IF YOU WIN
                        </small>

                        <strong
                          style={{
                            color: COLORS.clinch
                          }}
                        >
                          {report.winOdds === null
                            ? "—"
                            : pct(report.winOdds)}
                        </strong>

                        <small>
                          Playoff probability
                        </small>
                      </div>

                      <div className="dp-stat">
                        <small>
                          IF YOU LOSE
                        </small>

                        <strong
                          style={{
                            color: COLORS.out
                          }}
                        >
                          {report.lossOdds === null
                            ? "—"
                            : pct(report.lossOdds)}
                        </strong>

                        <small>
                          Playoff probability
                        </small>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="dp-muted">
                    No remaining matchup
                    supplied for this week.
                  </p>
                )}

                <h4>Who to Root For</h4>

                {report.rootingGuide.length ? (
                  report.rootingGuide.map(game => (
                    <div
                      className="dp-watch"
                      key={game.id}
                    >
                      <b>
                        {name(game.awayId)}
                        {" vs "}
                        {name(game.homeId)}
                      </b>

                      <p>
                        Root for{" "}
                        <b className="dp-gold">
                          {name(
                            game.mustWin ||
                            game.preferredWinner
                          )}
                        </b>

                        {game.mustWin
                          ? " — required to keep a modeled playoff path open"
                          : " — the more favorable outcome"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="dp-muted">
                    No other games are
                    available this week.
                  </p>
                )}

                {report.worst &&
                  report.weeklyGames.length > 0 && (
                    <details className="dp-details">
                      <summary>
                        Worst-Case Week
                        {" · "}
                        {pct(report.worst.odds)}
                        {" playoff chance"}
                      </summary>

                      {report.weeklyGames.map(
                        (game, index) => {
                          const winner =
                            report.worst
                              .winners[index];

                          return (
                            <p key={game.id}>
                              {name(winner)}
                              {" beats "}
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

                {report.best &&
                  report.weeklyGames.length > 0 && (
                    <details className="dp-details">
                      <summary>
                        Best-Case Week
                        {" · "}
                        {pct(report.best.odds)}
                        {" playoff chance"}
                      </summary>

                      {report.weeklyGames.map(
                        (game, index) => {
                          const winner =
                            report.best
                              .winners[index];

                          return (
                            <p key={game.id}>
                              {name(winner)}
                              {" beats "}
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

              </div>
            )}
          </>
        ) : (
          <p className="dp-muted">
            No unresolved playoff races
            to display.
          </p>
        )}
      </section>

      {/* SECTION 3: ROAD TO THE PLAYOFFS */}

      <section className="dp-panel">
        <span className="dp-kicker">
          POSTSEASON SURVIVAL
        </span>

        <h2>Road to the Playoffs</h2>

        <p className="dp-muted">
          See how many scenarios clinch
          a berth, keep an owner in the
          hunt, or eliminate them.
        </p>

        {!baseline.exact && (
          <p className="dp-warning">
            These counts come from{" "}
            {SIMULATIONS.toLocaleString()}
            {" "}sampled seasons, not every
            mathematical combination.
            A zero count does not prove
            official elimination.
          </p>
        )}

        {owner && selectedStats ? (
          <>
            <select
              className="dp-select"
              value={selectedId}
              onChange={event =>
                setSelection(
                  event.target.value
                )
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

            <div className="dp-report">

              <div className="dp-between">
                <h3>
                  {owner.ownerName}
                </h3>

                <span className="dp-status">
                  {baseline.exact
                    ? "In the Hunt"
                    : "Projected"}
                </span>
              </div>

              <div className="dp-three-grid">
                {[
                  {
                    key: "clinch",
                    title: "Clinch Berth"
                  },
                  {
                    key: "hunt",
                    title: "In the Hunt"
                  },
                  {
                    key: "out",
                    title: "Eliminated"
                  }
                ].map(item => (
                  <div
                    className="dp-stat"
                    key={item.key}
                  >
                    <strong
                      style={{
                        color:
                          COLORS[item.key]
                      }}
                    >
                      {selectedStats[
                        item.key
                      ].toLocaleString()}
                    </strong>

                    <small>
                      {item.title}
                    </small>
                  </div>
                ))}
              </div>

              <div className="dp-stack">
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
                        baseline.totalRuns *
                        100
                      }%`,
                      background: COLORS[key]
                    }}
                  />
                ))}
              </div>

              <p className="dp-muted">
                Out of{" "}
                {baseline.totalRuns.toLocaleString()}
                {" "}
                {baseline.exact
                  ? "remaining win/loss combinations"
                  : "sampled seasons"}.
              </p>

              {!finalTwoWeeks &&
                games.length > 0 && (
                  <div className="dp-locked">
                    <b>
                      Detailed Playoff Paths
                    </b>

                    <p>
                      Qualifying combinations
                      unlock during Weeks{" "}
                      {REGULAR_SEASON_END_WEEK - 1}
                      {"–"}
                      {REGULAR_SEASON_END_WEEK}.
                    </p>

                    <p>
                      Until then, use the weekly
                      guide to see what matters
                      this week.
                    </p>
                  </div>
                )}

              {finalTwoWeeks &&
                baseline.exact && (
                  <FinalWeekPaths
                    key={owner.ownerId}
                    owner={owner}
                    teams={teams}
                    games={games}
                    model={baseline}
                    byId={byId}
                  />
                )}

              {finalTwoWeeks &&
                !baseline.exact && (
                  <p className="dp-warning">
                    Too many games remain
                    for an exhaustive list.
                    Exact combinations will
                    become available once
                    {` ${EXACT_LIMIT} `}
                    or fewer games remain.
                  </p>
                )}

            </div>
          </>
        ) : (
          <p className="dp-muted">
            No unresolved playoff paths
            available.
          </p>
        )}

        <p className="dp-muted">
          Playoff qualification is modeled
          using current records, available
          remaining games, and league
          divisions when applicable.
          Counts are not official ESPN
          clinching decisions.
        </p>
      </section>

      <style jsx>{`
        .dp-root {
          color: #f1f4f8;
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin: 24px 0 45px;
        }

        .dp-panel {
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
          padding: 20px;
          min-width: 0;
        }

        .dp-kicker {
          color: #e7ba65;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.2px;
        }

        .dp-panel h2 {
          font-size: 23px;
          color: #fff;
          margin: 8px 0 12px;
        }

        .dp-panel h3 {
          font-size: 18px;
          color: #e7ba65;
          margin: 10px 0;
        }

        .dp-panel h4 {
          font-size: 14px;
          color: #e7ba65;
          margin: 20px 0 12px;
        }

        .dp-muted {
          color: #aebacb;
          font-size: 12px;
          line-height: 1.7;
        }

        .dp-between {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .dp-gold {
          color: #e7ba65;
        }

        .dp-odds-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 15px 0;
        }

        .dp-odds-card {
          background: #232d39;
          border: 1px solid #374454;
          border-radius: 9px;
          padding: 14px;
        }

        .dp-odds-card b {
          font-size: 12px;
        }

        .dp-odds-card small {
          display: block;
          color: #aebacb;
          font-size: 10px;
          margin-top: 9px;
        }

        .dp-track {
          background: #364453;
          height: 8px;
          border-radius: 99px;
          overflow: hidden;
          margin-top: 11px;
        }

        .dp-track div {
          background: #e7ba65;
          height: 100%;
        }

        .dp-select {
          width: 100%;
          max-width: 480px;
          padding: 13px;
          margin: 12px 0;
          background: #273342;
          border: 1px solid #806539;
          border-radius: 9px;
          color: #fff;
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

        .dp-status {
          color: #e7ba65;
          background: #413720;
          border: 1px solid #806539;
          border-radius: 8px;
          padding: 8px 11px;
          font-size: 11px;
          font-weight: 800;
        }

        .dp-two-grid,
        .dp-three-grid {
          display: grid;
          gap: 9px;
          margin: 16px 0;
        }

        .dp-two-grid {
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
        }

        .dp-three-grid {
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
          font-weight: 900;
        }

        .dp-stat small {
          color: #aebacb;
          font-size: 10px;
        }

        .dp-watch {
          border-bottom: 1px solid #3a4655;
          padding: 11px 0;
        }

        .dp-watch b {
          font-size: 12px;
        }

        .dp-watch p {
          margin: 8px 0 0;
        }

        .dp-details {
          background: #171d26;
          border: 1px solid #3a4655;
          border-radius: 9px;
          padding: 13px;
          margin-top: 12px;
        }

        .dp-details summary {
          cursor: pointer;
          color: #e7ba65;
          font-size: 12px;
          font-weight: 800;
        }

        .dp-details p {
          font-size: 12px;
          margin: 9px 0;
        }

        .dp-stack {
          height: 11px;
          display: flex;
          overflow: hidden;
          border-radius: 99px;
          background: #354355;
          margin: 15px 0;
        }

        .dp-stack div {
          height: 100%;
        }

        .dp-locked {
          background: #322c21;
          border: 1px solid #806539;
          border-radius: 9px;
          padding: 15px;
          margin-top: 16px;
        }

        .dp-locked b {
          color: #e7ba65;
          font-size: 13px;
        }

        .dp-locked p {
          color: #d4c4a6;
          font-size: 12px;
        }

        .dp-warning {
          background: #322c21;
          border: 1px solid #806539;
          border-radius: 9px;
          padding: 13px;
          color: #ead0a0;
          font-size: 12px;
          line-height: 1.7;
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

          .dp-three-grid .dp-stat {
            padding: 10px 4px;
          }

          .dp-three-grid .dp-stat small {
            font-size: 9px;
          }
        }
      `}</style>
    </div>
  );
}
