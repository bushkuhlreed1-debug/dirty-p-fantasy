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
  seedingRule = "",
  ownerId = null,
  embedded = false
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
  const selectedOwnerId = ownerId != null && sortedTeams.some(
    (t) => t.ownerId === Number(ownerId)
  ) ? Number(ownerId) : sortedTeams.some(
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


  if (!owner) return null;

  return (
    <details className="dp-tiebreak-clean">
      <summary className="dp-tiebreak-summary">
        <div>
          <span className="dp-tiebreak-eyebrow">PLAYOFF SEEDING</span>
          <strong>Tiebreakers</strong>
          <small>{owner.ownerName} · {rule.label}</small>
        </div>
        <span className="dp-tiebreak-chevron" aria-hidden="true">⌄</span>
      </summary>

      <div className="dp-tiebreak-content">
        <p className="dp-tiebreak-intro">
          Compare who currently holds the edge. Points shown are the difference,
          not total season points. These can change as games are played.
        </p>
        {!embedded && (
          <label className="dp-tiebreak-select-label">
            Owner
            <select value={selectedOwnerId ?? ""} onChange={e => setSelected(e.target.value)}>
              {sortedTeams.map(t => (
                <option key={t.ownerId} value={t.ownerId}>
                  {t.ownerName} ({statusText(t)})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="dp-tiebreak-toolbar">
          <strong>Opponent comparisons</strong>
          <button
            type="button"
            onClick={() => setTiedOnly(v => !v)}
          >
            {tiedOnly ? "Show all teams" : `Only tied teams (${tiedCount})`}
          </button>
        </div>

        <div className="dp-tiebreak-list">
          {visible.map(c => {
            const gap = Math.abs(c.myPF - c.theirPF);
            const pointsLeader = gap < 0.005 ? null
              : c.myPF > c.theirPF ? owner.ownerName : c.other.ownerName;
            const edge = c.leaderId === owner.ownerId ? "Advantage"
              : c.leaderId === c.other.ownerId ? "Behind" : "Unconfirmed";
            return (
              <details className="dp-tiebreak-row" key={c.other.ownerId}>
                <summary>
                  <div className="dp-tiebreak-opponent">
                    <strong>{c.other.ownerName}</strong>
                    <small>{statusText(c.other)} record{c.tied ? " · Same record" : ""}</small>
                  </div>
                  <div className="dp-tiebreak-row-right">
                    <b className={edge === "Advantage" ? "is-ahead" : edge === "Behind" ? "is-behind" : ""}>
                      {edge}
                    </b>
                    <small>{pointsLeader ? `${pointsLeader === owner.ownerName ? "Ahead" : "Behind"} by ${points(gap)} pts` : "Points tied"}</small>
                  </div>
                  <span className="dp-tiebreak-row-chevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="dp-tiebreak-row-detail">
                  <span>2026 head-to-head: <b>{c.myWins}–{c.theirWins}{c.ties ? "–" + c.ties : ""}</b></span>
                  <span>Points gap: <b>{points(gap)}</b></span>
                  <span>{c.leaderId != null ? `Current edge: ${c.leaderId === owner.ownerId ? owner.ownerName : c.other.ownerName} (${c.decidedBy})` : "Official edge not confirmed"}</span>
                </div>
              </details>
            );
          })}
          {!visible.length && (
            <p className="dp-tiebreak-intro">No teams have this owner's exact record right now. Choose "Show all teams" to compare the rest.</p>
          )}
        </div>
        <p className="dp-tiebreak-footnote">
          Provisional comparisons based on ESPN's current seeding rule.
          Future results and multi-team ties can change the order.
        </p>
      </div>

      <style jsx global>{`
        .dp-tiebreak-clean { margin-top: 18px; background: var(--dp-soft); border: 1px solid var(--dp-deep-line); border-radius: 12px; overflow: hidden; color: var(--dp-ink); }
        .dp-tiebreak-clean * { box-sizing: border-box; }
        .dp-tiebreak-summary { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 17px 19px; cursor: pointer; list-style: none; }
        .dp-tiebreak-summary::-webkit-details-marker, .dp-tiebreak-row summary::-webkit-details-marker { display: none; }
        .dp-tiebreak-summary > div { display: grid; gap: 4px; min-width: 0; }
        .dp-tiebreak-eyebrow { color: var(--dp-gold); letter-spacing: 1.3px; font-size: 10px; font-weight: 800; }
        .dp-tiebreak-summary strong { font-size: 18px; }
        .dp-tiebreak-summary small { color: var(--dp-muted); line-height: 1.5; }
        .dp-tiebreak-chevron { display: grid; place-items: center; flex: 0 0 30px; width: 30px; height: 30px; font-size: 23px; color: var(--dp-gold); background: var(--dp-strong); border-radius: 50%; transition: transform .15s; }
        .dp-tiebreak-clean[open] > .dp-tiebreak-summary .dp-tiebreak-chevron { transform: rotate(180deg); }
        .dp-tiebreak-content { border-top: 1px solid var(--dp-deep-line); padding: 17px; }
        .dp-tiebreak-intro, .dp-tiebreak-footnote { margin: 0 0 15px; font-size: 12px; color: var(--dp-muted); line-height: 1.6; }
        .dp-tiebreak-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
        .dp-tiebreak-toolbar strong { font-size: 13px; }
        .dp-tiebreak-toolbar button { cursor: pointer; font-weight: 700; background: var(--dp-strong); color: var(--dp-gold); border: 1px solid var(--dp-deep-line); border-radius: 8px; padding: 9px 12px; }
        .dp-tiebreak-list { display: grid; gap: 8px; }
        .dp-tiebreak-row { border: 1px solid var(--dp-deep-line); background: var(--dp-raised); border-radius: 10px; overflow: hidden; }
        .dp-tiebreak-row summary { cursor: pointer; display: flex; align-items: center; gap: 12px; justify-content: space-between; list-style: none; padding: 12px 13px; }
        .dp-tiebreak-row summary:hover, .dp-tiebreak-summary:hover { background: var(--dp-strong); }
        .dp-tiebreak-opponent { flex: 1 1 140px; display: grid; gap: 4px; min-width: 0; }
        .dp-tiebreak-opponent strong { font-size: 13px; color: var(--dp-ink); }
        .dp-tiebreak-opponent small, .dp-tiebreak-row-right small { color: var(--dp-muted); font-size: 11px; }
        .dp-tiebreak-row-right { display: grid; gap: 4px; text-align: right; flex: 0 1 190px; }
        .dp-tiebreak-row-right b { font-size: 12px; color: var(--dp-ink); }
        .dp-tiebreak-row-right b.is-ahead { color: var(--dp-green); }
        .dp-tiebreak-row-right b.is-behind { color: var(--dp-red); }
        .dp-tiebreak-row-chevron { font-size: 20px; color: var(--dp-gold); transition: transform .15s; }
        .dp-tiebreak-row[open] .dp-tiebreak-row-chevron { transform: rotate(180deg); }
        .dp-tiebreak-row-detail { border-top: 1px solid var(--dp-deep-line); padding: 13px; display: flex; flex-wrap: wrap; gap: 10px 20px; background: var(--dp-soft); color: var(--dp-muted); font-size: 12px; line-height: 1.5; }
        .dp-tiebreak-row-detail b { color: var(--dp-gold); }
        .dp-tiebreak-footnote { margin: 15px 1px 0; font-size: 11px; }
        .dp-tiebreak-select-label { display: grid; gap: 6px; max-width: 390px; font-size: 12px; }
        .dp-tiebreak-select-label select { background: var(--dp-strong); color: var(--dp-ink); border: 1px solid var(--dp-deep-line); border-radius: 8px; padding: 10px; }
        .dp-tiebreak-clean summary:focus-visible, .dp-tiebreak-clean button:focus-visible { outline: 2px solid var(--dp-gold-line); outline-offset: -2px; }
        @media(max-width: 520px) { .dp-tiebreak-content { padding: 12px; } .dp-tiebreak-row summary { gap: 8px; } .dp-tiebreak-row-right { flex-basis: 130px; } }
      `}</style>
    </details>
  );
}
