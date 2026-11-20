 "use client";

import { useMemo, useState } from "react";

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const points = (value) =>
  number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

function getRule(rule) {
  const value = String(rule || "").toUpperCase();
  if (/H2H|HEAD.TO.HEAD/.test(value)) {
    return { key: "H2H", label: "Head-to-head record, then points scored" };
  }
  if (/TOTAL_POINTS|POINTS_FOR|POINTS_SCORED/.test(value)) {
    return { key: "PF", label: "Total regular-season points scored" };
  }
  if (/INTRA|DIVISION/.test(value)) {
    return { key: "DIV", label: "Division record" };
  }
  if (/POINTS_AGAINST|AGAINST/.test(value)) {
    return { key: "PA", label: "Points against" };
  }
  return { key: "UNKNOWN", label: "Not confirmed from ESPN settings" };
}

const sameRecord = (a, b) =>
  number(a.wins) === number(b.wins) &&
  number(a.losses) === number(b.losses) &&
  number(a.ties) === number(b.ties);

const statusText = (team) =>
  String(number(team.wins)) + "-" + String(number(team.losses)) +
  (number(team.ties) ? "-" + String(number(team.ties)) : "");

export default function TiebreakerPanel({
  teams = [],
  completedGames = [],
  seedingRule = ""
}) {
  const [selected, setSelected] = useState("");
  const [tiedOnly, setTiedOnly] = useState(false);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) =>
      String(a.ownerName).localeCompare(String(b.ownerName))
    ),
    [teams]
  );

  const preferred = sortedTeams.find((t) => t.ownerName === "Reed Bushkuhl");
  const fallback = preferred || sortedTeams[0];
  const selectedOwnerId = sortedTeams.some(
    (t) => String(t.ownerId) === selected
  ) ? Number(selected) : fallback?.ownerId;
  const owner = sortedTeams.find((t) => t.ownerId === selectedOwnerId);
  const rule = getRule(seedingRule);

  const completed = useMemo(
    () => completedGames.filter((game) =>
      game?.completed === true &&
      !game.is_playoff &&
      !game.is_consolation &&
      !["playoff", "consolation"].includes(
        String(game.matchup_type || "regular").toLowerCase()
      )
    ),
    [completedGames]
  );

  const divisionRecords = useMemo(() => {
    const result = new Map(teams.map((t) =>
      [t.ownerId, { w: 0, l: 0, t: 0 }]
    ));
    const index = new Map(teams.map((t) => [t.ownerId, t]));
    for (const game of completed) {
      const h = number(game.home_owner_id);
      const a = number(game.away_owner_id);
      const ht = index.get(h);
      const at = index.get(a);
      if (!ht || !at || ht.divisionId == null ||
          at.divisionId == null ||
          String(ht.divisionId) !== String(at.divisionId)) {
        continue;
      }
      const homeRecord = result.get(h);
      const awayRecord = result.get(a);
      const winner = String(game.winner || "").toUpperCase();
      if (winner === "HOME") {
        homeRecord.w++; awayRecord.l++;
      } else if (winner === "AWAY") {
        homeRecord.l++; awayRecord.w++;
      } else if (winner === "TIE") {
        homeRecord.t++; awayRecord.t++;
      }
    }
    return result;
  }, [teams, completed]);

  const comparisons = useMemo(() => {
    if (!owner) return [];
    return sortedTeams
      .filter((other) => other.ownerId !== owner.ownerId)
      .map((other) => {
        let myWins = 0;
        let theirWins = 0;
        let ties = 0;
        for (const game of completed) {
          const homeId = number(game.home_owner_id);
          const awayId = number(game.away_owner_id);
          if (!(
            (homeId === owner.ownerId && awayId === other.ownerId) ||
            (homeId === other.ownerId && awayId === owner.ownerId)
          )) continue;
          const winner = String(game.winner || "").toUpperCase();
          const winnerId = winner === "HOME" ? homeId :
            winner === "AWAY" ? awayId : null;
          if (winnerId === owner.ownerId) myWins++;
          else if (winnerId === other.ownerId) theirWins++;
          else if (winner === "TIE") ties++;
        }

        const myPF = number(owner.pointsFor);
        const theirPF = number(other.pointsFor);
        const delta = myPF - theirPF;
        let leaderId = null;
        let decidedBy = "";
        if (rule.key === "H2H") {
          if (myWins !== theirWins) {
            leaderId = myWins > theirWins ? owner.ownerId : other.ownerId;
            decidedBy = "2026 head-to-head record";
          } else if (Math.abs(delta) > 0.004) {
            leaderId = delta > 0 ? owner.ownerId : other.ownerId;
            decidedBy = "points scored after tied head-to-head";
          }
        } else if (rule.key === "PF") {
          if (Math.abs(delta) > 0.004) {
            leaderId = delta > 0 ? owner.ownerId : other.ownerId;
            decidedBy = "total points scored";
          }
        } else if (rule.key === "DIV") {
          const first = divisionRecords.get(owner.ownerId);
          const second = divisionRecords.get(other.ownerId);
          const f = first?.w + first?.l + first?.t || 0;
          const s = second?.w + second?.l + second?.t || 0;
          if (f > 0 && s > 0 &&
              owner.divisionId != null &&
              String(owner.divisionId) === String(other.divisionId)) {
            const a = (first.w + first.t * 0.5) / f;
            const b = (second.w + second.t * 0.5) / s;
            if (Math.abs(a - b) > 0.00001) {
              leaderId = a > b ? owner.ownerId : other.ownerId;
              decidedBy = "division winning percentage";
            }
          }
        }

        return {
          other,
          myWins,
          theirWins,
          ties,
          myPF,
          theirPF,
          tied: sameRecord(owner, other),
          leaderId,
          decidedBy
        };
      })
      .sort((a, b) =>
        Number(b.tied) - Number(a.tied) ||
        number(b.other.wins) - number(a.other.wins) ||
        String(a.other.ownerName).localeCompare(
          String(b.other.ownerName)
        )
      );
  }, [owner, sortedTeams, completed, divisionRecords, rule.key]);

  const tiedGroups = useMemo(() => {
    const groups = new Map();
    for (const team of teams) {
      const record = statusText(team);
      if (!groups.has(record)) groups.set(record, []);
      groups.get(record).push(team);
    }
    return [...groups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([record, group]) => ({
        record,
        teams: group.sort((a, b) =>
          number(b.pointsFor) - number(a.pointsFor)
        )
      }))
      .sort((a, b) =>
        number(b.teams[0].wins) - number(a.teams[0].wins)
      );
  }, [teams]);

  const visible = comparisons.filter((c) => !tiedOnly || c.tied);
  const tiedCount = comparisons.filter((c) => c.tied).length;

  const surface = {
    background: "#171d26",
    border: "1px solid #303b49",
    borderRadius: 14,
    padding: 20,
    color: "#f1f4f8"
  };

  return (
    <section style={surface}>
      <div style={{
        color: "#e6b65b", fontSize: 11, fontWeight: 800,
        letterSpacing: 1.8, textTransform: "uppercase"
      }}>
        PLAYOFF SEEDING
      </div>
      <h2 style={{ margin: "7px 0 10px", fontSize: 23 }}>
        Who Holds the Tiebreaker?
      </h2>
      <p style={{ color: "#bac4d2", margin: "0 0 12px" }}>
        Check which owner has the edge if two teams finish with the
        same regular-season record. The comparison uses completed
        2026 matchups and current season scoring, not all-time rivalry records.
      </p>
      <div style={{
        background: "#101722", padding: "10px 12px",
        borderRadius: 9, border: "1px solid #344255",
        marginBottom: 14, fontSize: 13
      }}>
        <b>ESPN seeding tiebreaker: </b>{rule.label}
        {rule.key === "UNKNOWN" && (
          <p style={{ color: "#bac4d2", margin: "5px 0 0" }}>
            ESPN did not return a recognized seeding rule. Head-to-head
            and points totals are shown below for reference, but no
            official pairwise leader is assigned.
          </p>
        )}
      </div>

      {rule.key === "PF" && tiedGroups.length > 0 && (
        <div style={{
          border: "1px solid #536076", borderRadius: 10,
          background: "#141e2a", padding: 12, marginBottom: 14
        }}>
          <b style={{ color: "#e6b65b", fontSize: 14 }}>
            Current standings ties — points-for order
          </b>
          {tiedGroups.map((group) => (
            <div key={group.record} style={{
              borderTop: "1px solid #364255",
              marginTop: 10, paddingTop: 9
            }}>
              <b style={{ fontSize: 13 }}>
                {group.record} record
              </b>
              <div style={{
                display: "flex", gap: 7, flexWrap: "wrap",
                marginTop: 6, fontSize: 13, color: "#d8e2ec"
              }}>
                {group.teams.map((team, index) => (
                  <span key={team.ownerId}>
                    {index ? "› " : ""}
                    {team.ownerName} ({points(team.pointsFor)})
                  </span>
                ))}
              </div>
            </div>
          ))}
          <small style={{ color: "#aab6c7", display: "block", marginTop: 9 }}>
            Ordered by current points scored. The advantage can change
            before the regular season ends.
          </small>
        </div>
      )}

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10,
        alignItems: "flex-end", marginBottom: 14
      }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 210px" }}>
          <span style={{ fontSize: 12, color: "#bac4d2" }}>
            Compare this owner
          </span>
          <select
            aria-label="Select owner for tiebreaker comparison"
            value={selectedOwnerId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              width: "100%", background: "#0f1722",
              color: "white", border: "1px solid #455164",
              borderRadius: 8, padding: "10px", fontSize: 15
            }}
          >
            {sortedTeams.map((t) => (
              <option key={t.ownerId} value={t.ownerId}>
                {t.ownerName} ({statusText(t)})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setTiedOnly((v) => !v)}
          aria-pressed={tiedOnly}
          style={{
            background: tiedOnly ? "#e6b65b" : "#283547",
            color: tiedOnly ? "#14191e" : "white",
            border: "1px solid #506079", borderRadius: 8,
            padding: "11px 13px", fontWeight: 750, cursor: "pointer"
          }}
        >
          {tiedOnly ? "Show all opponents" :
            "Same record only (" + tiedCount + ")"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {visible.map((c) => {
          const leading = c.leaderId === owner.ownerId
            ? owner.ownerName
            : c.leaderId === c.other.ownerId
              ? c.other.ownerName
              : null;
          return (
            <div key={c.other.ownerId} style={{
              border: "1px solid #344255", borderRadius: 10,
              background: "#1c2735", padding: 13
            }}>
              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                justifyContent: "space-between", alignItems: "baseline"
              }}>
                <b>{owner.ownerName} vs. {c.other.ownerName}</b>
                {c.tied && (
                  <span style={{
                    fontSize: 11, color: "#e6b65b",
                    fontWeight: 800
                  }}>SAME RECORD</span>
                )}
              </div>
              <p style={{ color: "#d9e1ec", margin: "7px 0 4px", fontSize: 13 }}>
                2026 head-to-head: <b>{c.myWins}–{c.theirWins}
                {c.ties ? "–" + c.ties : ""}</b>
                {" · "}Season points: <b>{points(c.myPF)} vs. {points(c.theirPF)}</b>
              </p>
              <div style={{
                color: leading ? "#7ed9b0" : "#c6cbd4",
                fontWeight: 700, fontSize: 13
              }}>
                {leading
                  ? "Current tiebreaker edge: " + leading +
                    " (" + c.decidedBy + ")"
                  : rule.key === "UNKNOWN"
                    ? "Official edge not determined; seeding rule unavailable."
                    : "No confirmed pairwise edge from the available criteria."}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p style={{ color: "#bac4d2", margin: 0 }}>
            This owner is not currently tied with anyone in the standings.
            Choose “Show all opponents” to compare possible future ties.
          </p>
        )}
      </div>
      <p style={{
        color: "#aab6c7", fontSize: 12, marginBottom: 0,
        lineHeight: 1.6
      }}>
        These are provisional edges, not locked playoff tiebreakers.
        Future wins and scoring can change them. In multi-team ties,
        ESPN may apply group tiebreak rules rather than one-on-one results.
        Scenario win/loss percentages remain estimates, not ESPN forecasts.
      </p>
    </section>
  );
}
