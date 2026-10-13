"use client";

import { useMemo, useState } from "react";

// =====================================================
// HELPERS
// =====================================================

function winPercentage(team) {
  const games =
    team.wins +
    team.losses +
    team.ties;

  return games
    ? (team.wins + team.ties * 0.5) / games
    : 0;
}

function compareTeams(a, b) {
  return (
    winPercentage(b) - winPercentage(a) ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

function record(team) {
  const base = `${team.wins}-${team.losses}`;

  return team.ties
    ? `${base}-${team.ties}`
    : base;
}

function getPlayoffField(teams, playoffCount) {
  const divisions = new Map();

  for (const team of teams) {
    if (
      team.divisionId === null ||
      team.divisionId === undefined ||
      team.divisionId === ""
    ) {
      continue;
    }

    const id = String(team.divisionId);

    if (!divisions.has(id)) {
      divisions.set(id, []);
    }

    divisions.get(id).push(team);
  }

  // Dirty P: 2 division winners + 2 wild cards.

  if (divisions.size !== 2) {
    return {
      hasDivisions: false,
      leaders: [],
      wildCards: [],
      field: [...teams]
        .sort(compareTeams)
        .slice(0, playoffCount),
    };
  }

  const leaders = [...divisions.values()]
    .map(
      (divisionTeams) =>
        [...divisionTeams].sort(compareTeams)[0]
    )
    .filter(Boolean)
    .sort(compareTeams);

  const leaderIds = new Set(
    leaders.map((team) => team.ownerId)
  );

  const wildCards = teams
    .filter(
      (team) => !leaderIds.has(team.ownerId)
    )
    .sort(compareTeams)
    .slice(
      0,
      Math.max(0, playoffCount - leaders.length)
    );

  return {
    hasDivisions: true,
    leaders,
    wildCards,
    field: [...leaders, ...wildCards],
  };
}

// =====================================================
// MAIN SIMULATOR
// =====================================================

export default function ScenarioSimulator({
  teams,
  games,
  currentWeek,
  season,
  playoffCount,
}) {
  const [picks, setPicks] = useState({});
  const [selectedOwner, setSelectedOwner] =
    useState("");

  const [expandedWeeks, setExpandedWeeks] =
    useState([currentWeek]);

  const ownerMap = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.ownerId,
          team,
        ])
      ),
    [teams]
  );

  // ===================================================
  // APPLY SELECTED WINNERS
  // ===================================================

  const simulatedTeams = useMemo(() => {
    const result = teams.map((team) => ({
      ...team,
      wins: Number(team.wins) || 0,
      losses: Number(team.losses) || 0,
      ties: Number(team.ties) || 0,
    }));

    const byOwner = new Map(
      result.map((team) => [
        team.ownerId,
        team,
      ])
    );

    for (const game of games) {
      const winnerId = Number(
        picks[game.id]
      );

      if (!winnerId) continue;

      const home = byOwner.get(game.homeId);
      const away = byOwner.get(game.awayId);

      if (!home || !away) continue;

      if (winnerId === home.ownerId) {
        home.wins += 1;
        away.losses += 1;
      } else if (
        winnerId === away.ownerId
      ) {
        away.wins += 1;
        home.losses += 1;
      }
    }

    return result;
  }, [teams, games, picks]);

  const playoff = useMemo(
    () =>
      getPlayoffField(
        simulatedTeams,
        playoffCount
      ),
    [simulatedTeams, playoffCount]
  );

  const divisions = useMemo(() => {
    const groups = new Map();

    for (const team of simulatedTeams) {
      const id = String(
        team.divisionId ?? "unknown"
      );

      if (!groups.has(id)) {
        groups.set(id, {
          id,
          name:
            team.divisionName ||
            (id === "unknown"
              ? "Division Not Available"
              : `Division ${id}`),
          teams: [],
        });
      }

      groups.get(id).teams.push(team);
    }

    return [...groups.values()].map(
      (division) => ({
        ...division,
        teams: division.teams.sort(compareTeams),
      })
    );
  }, [simulatedTeams]);

  const weeks = useMemo(
    () =>
      [
        ...new Set(
          games.map((game) => game.week)
        ),
      ].sort((a, b) => a - b),
    [games]
  );

  const selectedTeam = simulatedTeams.find(
    (team) =>
      String(team.ownerId) ===
      String(selectedOwner)
  );

  const selectedGames = selectedTeam
    ? games.filter(
        (game) =>
          game.homeId === selectedTeam.ownerId ||
          game.awayId === selectedTeam.ownerId
      )
    : [];

  const selectedPicks = games.filter(
    (game) => picks[game.id]
  ).length;

  // ===================================================
  // ACTIONS
  // ===================================================

  function chooseWinner(gameId, winnerId) {
    setPicks((current) => {
      const next = { ...current };

      if (next[gameId] === winnerId) {
        delete next[gameId];
      } else {
        next[gameId] = winnerId;
      }

      return next;
    });
  }

  function toggleWeek(week) {
    setExpandedWeeks((current) =>
      current.includes(week)
        ? current.filter(
            (item) => item !== week
          )
        : [...current, week]
    );
  }

  function setTeamOutcome(ownerId, shouldWin) {
    setPicks((current) => {
      const next = { ...current };

      for (const game of games) {
        if (
          game.homeId !== ownerId &&
          game.awayId !== ownerId
        ) {
          continue;
        }

        const opponent =
          game.homeId === ownerId
            ? game.awayId
            : game.homeId;

        next[game.id] =
          shouldWin ? ownerId : opponent;
      }

      return next;
    });
  }

  function teamStatus(ownerId) {
    if (
      playoff.leaders.some(
        (team) =>
          team.ownerId === ownerId
      )
    ) {
      return "Division Leader";
    }

    if (
      playoff.wildCards.some(
        (team) =>
          team.ownerId === ownerId
      )
    ) {
      return "Wild Card";
    }

    if (
      playoff.field.some(
        (team) =>
          team.ownerId === ownerId
      )
    ) {
      return "Projected Playoff Spot";
    }

    return "Outside";
  }

  // ===================================================
  // RENDER
  // ===================================================

  return (
    <div className="scenario-root">

      {/* PLAYOFF FIELD */}

      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="scenario-eyebrow">
              PLAYOFF PICTURE
            </span>

            <h2>Projected Playoff Field</h2>
          </div>

          <span className="scenario-small">
            {selectedPicks} of {games.length}
            {" "}results selected
          </span>
        </div>

        <div className="scenario-field">
          {playoff.field.map((team, index) => (
            <div
              className="scenario-seed"
              key={team.ownerId}
            >
              <span className="scenario-seed-number">
                #{index + 1}
              </span>

              <div className="scenario-team-info">
                <strong>
                  {team.ownerName}
                </strong>

                <span>
                  {team.teamName}
                </span>
              </div>

              <div className="scenario-seed-status">
                <strong>
                  {record(team)}
                </strong>

                <span>
                  {teamStatus(team.ownerId)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="scenario-note">
          Projection based on current ESPN records
          and the game results you select below.
          This is not an official clinching or
          elimination calculation. Current points-for
          is used as a simplified tiebreaker.
        </p>
      </section>

      {/* DIVISION RACES */}

      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="scenario-eyebrow">
              DIVISION RACES
            </span>

            <h2>Road to the Playoffs</h2>
          </div>
        </div>

        <div className="scenario-divisions">
          {divisions.map((division) => (
            <div
              className="scenario-division"
              key={division.id}
            >
              <h3>
                {division.name}
              </h3>

              {division.teams.map(
                (team, index) => (
                  <div
                    className="scenario-division-row"
                    key={team.ownerId}
                  >
                    <span
                      className={
                        index === 0
                          ? "scenario-rank leader"
                          : "scenario-rank"
                      }
                    >
                      #{index + 1}
                    </span>

                    <span className="scenario-owner">
                      {team.ownerName}
                    </span>

                    <strong>
                      {record(team)}
                    </strong>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </section>

      {/* WHAT-IF SIMULATOR */}

      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="scenario-eyebrow">
              INTERACTIVE SIMULATOR
            </span>

            <h2>What If?</h2>
          </div>

          <button
            type="button"
            className="scenario-reset"
            onClick={() => setPicks({})}
          >
            Reset All
          </button>
        </div>

        <p className="scenario-intro">
          Choose the winners of future fantasy
          matchups. Your projected playoff field
          and division standings will update
          automatically.
        </p>

        <div className="scenario-weeks">
          {weeks.length ? (
            weeks.map((week) => {
              const weekGames =
                games.filter(
                  (game) =>
                    game.week === week
                );

              const expanded =
                expandedWeeks.includes(week);

              const pickedCount =
                weekGames.filter(
                  (game) =>
                    picks[game.id]
                ).length;

              return (
                <div
                  className="scenario-week"
                  key={week}
                >
                  <button
                    type="button"
                    className="scenario-week-toggle"
                    onClick={() =>
                      toggleWeek(week)
                    }
                  >
                    <strong>
                      Week {week}
                    </strong>

                    <span>
                      {pickedCount}/{weekGames.length}
                      {" "}selected
                      {expanded ? " −" : " +"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="scenario-games">
                      {weekGames.map((game) => {
                        const away =
                          ownerMap.get(
                            game.awayId
                          );

                        const home =
                          ownerMap.get(
                            game.homeId
                          );

                        return (
                          <div
                            className="scenario-game"
                            key={game.id}
                          >
                            <button
                              type="button"
                              className={
                                "scenario-pick " +
                                (
                                  picks[game.id] ===
                                  game.awayId
                                    ? "selected"
                                    : ""
                                )
                              }
                              onClick={() =>
                                chooseWinner(
                                  game.id,
                                  game.awayId
                                )
                              }
                            >
                              {away?.ownerName || "Away"}
                            </button>

                            <span className="scenario-vs">
                              VS
                            </span>

                            <button
                              type="button"
                              className={
                                "scenario-pick " +
                                (
                                  picks[game.id] ===
                                  game.homeId
                                    ? "selected"
                                    : ""
                                )
                              }
                              onClick={() =>
                                chooseWinner(
                                  game.id,
                                  game.homeId
                                )
                              }
                            >
                              {home?.ownerName || "Home"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="scenario-empty">
              No remaining fantasy matchups
              are currently available.
            </div>
          )}
        </div>
      </section>

      {/* TEAM-SPECIFIC SCENARIOS */}

      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="scenario-eyebrow">
              TEAM-BY-TEAM
            </span>

            <h2>Explore a Team's Path</h2>
          </div>
        </div>

        <select
          className="scenario-select"
          value={selectedOwner}
          onChange={(event) =>
            setSelectedOwner(
              event.target.value
            )
          }
        >
          <option value="">
            Select an owner
          </option>

          {[...teams]
            .sort(
              (a, b) =>
                a.ownerName.localeCompare(
                  b.ownerName
                )
            )
            .map((team) => (
              <option
                key={team.ownerId}
                value={team.ownerId}
              >
                {team.ownerName}
              </option>
            ))}
        </select>

        {selectedTeam && (
          <div className="scenario-team-detail">
            <div className="scenario-team-summary">
              <div>
                <h3>
                  {selectedTeam.ownerName}
                </h3>

                <span>
                  {selectedTeam.teamName}
                </span>
              </div>

              <div>
                <strong>
                  {record(selectedTeam)}
                </strong>

                <span>
                  {teamStatus(
                    selectedTeam.ownerId
                  )}
                </span>
              </div>
            </div>

            <p className="scenario-intro">
              {selectedGames.length}
              {" "}remaining games are available
              for this team in the schedule.
            </p>

            <div className="scenario-actions">
              <button
                type="button"
                onClick={() =>
                  setTeamOutcome(
                    selectedTeam.ownerId,
                    true
                  )
                }
              >
                Win Remaining Games
              </button>

              <button
                type="button"
                onClick={() =>
                  setTeamOutcome(
                    selectedTeam.ownerId,
                    false
                  )
                }
              >
                Lose Remaining Games
              </button>
            </div>

            <div className="scenario-outlook">
              {playoff.field.some(
                (team) =>
                  team.ownerId ===
                  selectedTeam.ownerId
              )
                ? "Currently inside the projected playoff field under your selections."
                : "Currently outside the projected playoff field under your selections."}
            </div>
          </div>
        )}
      </section>

      <p className="scenario-disclaimer">
        {season} playoff projections use
        ESPN standings and available remaining
        matchups. They are illustrative,
        not official mathematical clinching
        or elimination scenarios. Changes to
        future points-for, head-to-head
        tiebreakers, and other ESPN settings
        are not simulated.
      </p>

      <style jsx>{`
        .scenario-root {
          display:flex;
          flex-direction:column;
          gap:30px;
          margin:24px 0 36px;
          color:#f3f5f7;
        }

        .scenario-section {
          display:flex;
          flex-direction:column;
          gap:15px;
        }

        .scenario-heading {
          display:flex;
          align-items:end;
          justify-content:space-between;
          flex-wrap:wrap;
          gap:12px;
        }

        .scenario-eyebrow {
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:1px;
        }

        .scenario-heading h2 {
          margin:5px 0 0;
          color:#f5f6f8;
          font-size:23px;
        }

        .scenario-small,
        .scenario-note,
        .scenario-intro,
        .scenario-disclaimer {
          color:#9cabbc;
          font-size:12px;
          line-height:1.7;
        }

        .scenario-field {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .scenario-seed {
          display:flex;
          align-items:center;
          gap:15px;
          padding:17px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }

        .scenario-seed-number {
          color:#e9bd67;
          font-size:24px;
          font-weight:900;
          width:40px;
        }

        .scenario-team-info {
          flex:1;
          display:flex;
          flex-direction:column;
          gap:5px;
          min-width:0;
        }

        .scenario-team-info strong {
          font-size:15px;
        }

        .scenario-team-info span,
        .scenario-seed-status span {
          color:#9cabbc;
          font-size:11px;
        }

        .scenario-seed-status {
          display:flex;
          flex-direction:column;
          gap:5px;
          text-align:right;
        }

        .scenario-note,
        .scenario-disclaimer {
          margin:0;
        }

        .scenario-divisions {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .scenario-division {
          min-width:0;
          padding:18px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }

        .scenario-division h3 {
          margin:0 0 14px;
          color:#e9bd67;
          font-size:15px;
        }

        .scenario-division-row {
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px 0;
          border-top:1px solid #29313d;
          font-size:12px;
        }

        .scenario-rank {
          width:24px;
          color:#8795a6;
        }

        .scenario-rank.leader {
          color:#e9bd67;
          font-weight:900;
        }

        .scenario-owner {
          flex:1;
        }

        .scenario-reset,
        .scenario-actions button {
          padding:10px 14px;
          border:1px solid #806539;
          background:#242c38;
          color:#e9bd67;
          border-radius:8px;
          font-size:12px;
          font-weight:800;
          cursor:pointer;
        }

        .scenario-reset:hover,
        .scenario-actions button:hover {
          background:#333c49;
        }

        .scenario-intro {
          margin:0;
        }

        .scenario-weeks {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .scenario-week {
          overflow:hidden;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }

        .scenario-week-toggle {
          display:flex;
          align-items:center;
          justify-content:space-between;
          width:100%;
          padding:16px;
          background:transparent;
          border:0;
          color:#f5f6f8;
          font-size:13px;
          cursor:pointer;
          text-align:left;
        }

        .scenario-week-toggle span {
          color:#9cabbc;
          font-size:11px;
        }

        .scenario-games {
          padding:0 14px 14px;
        }

        .scenario-game {
          display:grid;
          grid-template-columns:
            minmax(0,1fr)
            24px
            minmax(0,1fr);
          align-items:center;
          gap:9px;
          padding:9px 0;
          border-top:1px solid #29313d;
        }

        .scenario-vs {
          color:#7e8c9e;
          font-size:10px;
          font-weight:900;
          text-align:center;
        }

        .scenario-pick {
          min-width:0;
          padding:11px 8px;
          background:#242c38;
          border:1px solid #394554;
          border-radius:8px;
          color:#d1d9e2;
          font-size:12px;
          font-weight:700;
          cursor:pointer;
          overflow-wrap:anywhere;
        }

        .scenario-pick.selected {
          background:#3c3422;
          border-color:#d7ad63;
          color:#f3c979;
        }

        .scenario-empty {
          padding:25px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          color:#9cabbc;
          font-size:13px;
        }

        .scenario-select {
          width:100%;
          max-width:370px;
          padding:13px;
          background:#171d26;
          border:1px solid #806539;
          border-radius:9px;
          color:#f5f6f8;
          font-size:13px;
        }

        .scenario-team-detail {
          display:flex;
          flex-direction:column;
          gap:15px;
          padding:20px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }

        .scenario-team-summary {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        }

        .scenario-team-summary > div {
          display:flex;
          flex-direction:column;
          gap:5px;
        }

        .scenario-team-summary h3 {
          margin:0;
          font-size:17px;
        }

        .scenario-team-summary span {
          color:#9cabbc;
          font-size:11px;
        }

        .scenario-team-summary > div:last-child {
          text-align:right;
        }

        .scenario-actions {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }

        .scenario-outlook {
          padding:13px;
          background:#24291f;
          border-radius:8px;
          color:#e9bd67;
          font-size:12px;
          line-height:1.6;
        }

        @media(max-width:700px) {
          .scenario-divisions {
            grid-template-columns:1fr;
          }
        }

        @media(max-width:480px) {
          .scenario-heading h2 {
            font-size:19px;
          }

          .scenario-seed {
            gap:9px;
            padding:13px;
          }

          .scenario-seed-number {
            font-size:20px;
            width:30px;
          }

          .scenario-team-info strong {
            font-size:13px;
          }

          .scenario-game {
            gap:5px;
          }

          .scenario-pick {
            font-size:11px;
            padding:10px 5px;
          }
        }
      `}</style>
    </div>
  );
}
