"use client";

import { useMemo, useState } from "react";

function pct(team) {
  const played =
    team.wins + team.losses + team.ties;

  return played
    ? (team.wins + team.ties * 0.5) / played
    : 0;
}

function sortTeams(a, b) {
  return (
    pct(b) - pct(a) ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

function record(team) {
  return team.ties
    ? `${team.wins}-${team.losses}-${team.ties}`
    : `${team.wins}-${team.losses}`;
}

function findPlayoffField(teams, playoffCount) {
  const divisions = new Map();

  for (const team of teams) {
    const divisionId =
      team.divisionId === null ||
      team.divisionId === undefined
        ? null
        : String(team.divisionId);

    if (!divisionId) continue;

    if (!divisions.has(divisionId)) {
      divisions.set(divisionId, []);
    }

    divisions.get(divisionId).push(team);
  }

  // Two division winners qualify.
  const leaders = Array.from(divisions.values())
    .map((division) =>
      [...division].sort(sortTeams)[0]
    )
    .filter(Boolean)
    .sort(sortTeams);

  // Without both divisions, we cannot
  // accurately identify division winners.
  if (divisions.size !== 2) {
    return {
      divisionsAvailable: false,
      leaders: [],
      wildCards: [],
      field: [...teams]
        .sort(sortTeams)
        .slice(0, playoffCount),
    };
  }

  const leaderIds = new Set(
    leaders.map((team) => team.ownerId)
  );

  const wildCards = teams
    .filter(
      (team) => !leaderIds.has(team.ownerId)
    )
    .sort(sortTeams)
    .slice(
      0,
      Math.max(0, playoffCount - leaders.length)
    );

  return {
    divisionsAvailable: true,
    leaders,
    wildCards,
    field: [...leaders, ...wildCards],
  };
}

export default function ScenarioSimulator({
  teams,
  games,
  currentWeek,
  season,
  playoffCount,
}) {
  const [picks, setPicks] = useState({});
  const [selectedOwner, setSelectedOwner] =
    useState(null);

  const [expandedWeeks, setExpandedWeeks] =
    useState([currentWeek]);

  const simulatedTeams = useMemo(() => {
    const calculated = teams.map((team) => ({
      ...team,
      wins: Number(team.wins) || 0,
      losses: Number(team.losses) || 0,
      ties: Number(team.ties) || 0,
    }));

    const teamMap = new Map(
      calculated.map((team) => [
        team.ownerId,
        team,
      ])
    );

    for (const game of games) {
      const winnerId = Number(picks[game.id]);

      if (!winnerId) continue;

      const home = teamMap.get(game.homeId);
      const away = teamMap.get(game.awayId);

      if (!home || !away) continue;

      if (winnerId === home.ownerId) {
        home.wins++;
        away.losses++;
      } else if (winnerId === away.ownerId) {
        away.wins++;
        home.losses++;
      }
    }

    return calculated;
  }, [teams, games, picks]);

  const scenario = useMemo(
    () =>
      findPlayoffField(
        simulatedTeams,
        playoffCount
      ),
    [simulatedTeams, playoffCount]
  );

  const divisionGroups = useMemo(() => {
    const map = new Map();

    for (const team of simulatedTeams) {
      const id = String(
        team.divisionId ?? "unknown"
      );

      const name =
        team.divisionName ||
        (id === "unknown"
          ? "Division Unavailable"
          : `Division ${id}`);

      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          teams: [],
        });
      }

      map.get(id).teams.push(team);
    }

    return Array.from(map.values()).map(
      (division) => ({
        ...division,
        teams: division.teams.sort(sortTeams),
      })
    );
  }, [simulatedTeams]);

  const weeks = useMemo(
    () =>
      [...new Set(games.map((game) => game.week))]
        .sort((a, b) => a - b),
    [games]
  );

  const ownerMap = new Map(
    teams.map((team) => [
      team.ownerId,
      team,
    ])
  );

  const selectedTeam =
    simulatedTeams.find(
      (team) => team.ownerId === selectedOwner
    ) || null;

  const selectedRemainingGames = selectedTeam
    ? games.filter(
        (game) =>
          game.homeId === selectedTeam.ownerId ||
          game.awayId === selectedTeam.ownerId
      )
    : [];

  const completedPicks = games.filter(
    (game) => picks[game.id]
  ).length;

  const selectedTeamInPlayoffs =
    selectedTeam &&
    scenario.field.some(
      (team) =>
        team.ownerId === selectedTeam.ownerId
    );

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
        ? current.filter((item) => item !== week)
        : [...current, week]
    );
  }

  function setRemainingForTeam(ownerId, shouldWin) {
    const next = { ...picks };

    for (const game of games) {
      if (
        game.homeId !== ownerId &&
        game.awayId !== ownerId
      ) {
        continue;
      }

      const opponentId =
        game.homeId === ownerId
          ? game.awayId
          : game.homeId;

      next[game.id] =
        shouldWin ? ownerId : opponentId;
    }

    setPicks(next);
  }

  function fieldStatus(ownerId) {
    if (
      scenario.leaders.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Division Leader";
    }

    if (
      scenario.wildCards.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Wild Card";
    }

    if (
      scenario.field.some(
        (team) => team.ownerId === ownerId
      )
    ) {
      return "Projected Playoff Spot";
    }

    return "Outside";
  }

  return (
    <div className="scenario-root">

      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="scenario-eyebrow">
              CURRENT PICTURE
            </span>
            <h2>Projected Playoff Field</h2>
          </div>

          <span className="scenario-small">
            {completedPicks} of {games.length}
            {" "}future games selected
          </span>
        </div>

        <div className="scenario-field">
          {scenario.field.map((team, index) => (
            <div
              className="scenario-seed"
              key={team.ownerId}
            >
              <div className="scenario-seed-number">
                #{index + 1}
              </div>

              <div className="scenario-team-info">
                <strong>
                  {team.ownerName}
                </strong>

                <span>
                  {team.teamName}
                </span>
              </div>

              <div className="scenario-field-right">
                <strong>
                  {record(team)}
                </strong>

                <span>
                  {fieldStatus(team.ownerId)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="scenario-note">
          This field is a projection based on the
          selected game results. It is not an
          official ESPN clinching determination.
          Unselected games have no simulated
          result, and the simulator uses current
          points-for as a simplified tiebreaker.
        </p>
      </section>

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
          {divisionGroups.map((division) => (
            <div
              className="scenario-division"
              key={division.id}
            >
              <h3>{division.name}</h3>

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

                    <span className="scenario-division-name">
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
          Select a winner for any remaining game.
          Watch the projected division standings
          and playoff field change instantly.
        </p>

        {weeks.length ? (
          <div className="scenario-weeks">
            {weeks.map((week) => {
              const weekGames =
                games.filter(
                  (game) => game.week === week
                );

              const expanded =
                expandedWeeks.includes(week);

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
                    <span>
                      Week {week}
                    </span>

                    <span>
                      {
                        weekGames.filter(
                          (game) =>
                            picks[game.id]
                        ).length
                      }
                      /{weekGames.length}
                      {" "}selected
                      {" "}
                      {expanded ? "−" : "+"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="scenario-games">
                      {weekGames.map((game) => {
                        const away =
                          ownerMap.get(game.awayId);

                        const home =
                          ownerMap.get(game.homeId);

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
                              {away?.ownerName ||
                                "Away"}
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
                              {home?.ownerName ||
                                "Home"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="scenario-empty">
            No remaining matchup schedule is
            available from ESPN.
          </div>
        )}
      </section>

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
          value={selectedOwner ?? ""}
          onChange={(event) =>
            setSelectedOwner(
              event.target.value
                ? Number(event.target.value)
                : null
            )
          }
        >
          <option value="">
            Select an owner
          </option>

          {teams
            .slice()
            .sort((a, b) =>
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
                  {fieldStatus(
                    selectedTeam.ownerId
                  )}
                </span>
              </div>
            </div>

            <p className="scenario-intro">
              {selectedRemainingGames.length}
              {" "}remaining games available
              in the ESPN schedule.
              Try winning or losing those
              games to see how the projected
              playoff field changes.
            </p>

            <div className="scenario-actions">
              <button
                type="button"
                onClick={() =>
                  setRemainingForTeam(
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
                  setRemainingForTeam(
                    selectedTeam.ownerId,
                    false
                  )
                }
              >
                Lose Remaining Games
              </button>
            </div>

            <div className="scenario-outlook">
              {selectedTeamInPlayoffs
                ? "Currently in the projected playoff field under your selected results."
                : "Currently outside the projected playoff field under your selected results."}
            </div>
          </div>
        )}
      </section>

      <p className="scenario-disclaimer">
        Season {season} · Based on ESPN league
        standings and the remaining matchups
        available in the data feed. The simulator
        is illustrative: it does not calculate
        official mathematical clinches,
        eliminations, or ESPN-specific
        tiebreakers.
      </p>

      <style jsx>{`
        .scenario-root {
          display:flex;
          flex-direction:column;
          gap:26px;
          color:#f3f5f7;
          margin:24px 0 36px;
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
          font-size:23px;
          color:#f5f6f8;
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
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          padding:17px;
        }

        .scenario-seed-number {
          color:#e9bd67;
          font-size:24px;
          font-weight:900;
          width:40px;
        }

        .scenario-team-info,
        .scenario-field-right {
          display:flex;
          flex-direction:column;
          gap:5px;
        }

        .scenario-team-info {
          flex:1;
          min-width:0;
        }

        .scenario-team-info strong {
          font-size:15px;
        }

        .scenario-team-info span,
        .scenario-field-right span {
          color:#9cabbc;
          font-size:11px;
        }

        .scenario-field-right {
          text-align:right;
          flex-shrink:0;
        }

        .scenario-field-right strong {
          font-size:15px;
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
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          padding:18px;
          min-width:0;
        }

        .scenario-division h3 {
          color:#e9bd67;
          font-size:15px;
          margin:0 0 14px;
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
          color:#8795a6;
          width:24px;
        }

        .scenario-rank.leader {
          color:#e9bd67;
          font-weight:900;
        }

        .scenario-division-name {
          flex:1;
        }

        .scenario-reset,
        .scenario-actions button {
          background:#242c38;
          border:1px solid #806539;
          color:#e9bd67;
          border-radius:8px;
          padding:10px 14px;
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
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          overflow:hidden;
        }

        .scenario-week-toggle {
          display:flex;
          width:100%;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding:16px;
          border:0;
          background:transparent;
          color:#f5f6f8;
          font-size:13px;
          font-weight:800;
          cursor:pointer;
          text-align:left;
        }

        .scenario-week-toggle span:last-child {
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
            minmax
