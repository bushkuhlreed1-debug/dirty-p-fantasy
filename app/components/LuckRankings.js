"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function record(w,l,t) { return t ? `${w}-${l}-${t}` : `${w}-${l}`; }
const fixed = x => Number(x||0).toFixed(2);
export default function LuckRankings({ data }) {
  const [season,setSeason]=useState("all");
  const rows=useMemo(()=>season==="all"?data.allTime:(data.bySeason[String(season)]||[]),[data,season]);
  const luckiest=rows[0]||null;
  const unluckiest=rows.length>1?rows[rows.length-1]:null;
  return (
    <div className="dp-luck-module">
      <div className="dp-luck-toolbar">
        <p>Actual head-to-head wins versus how many wins a team's weekly scores deserve against the whole league.</p>
        <label>View
          <select value={season} onChange={event=>setSeason(event.target.value)}>
            <option value="all">All-time</option>
            {data.seasons.map(year=><option key={year} value={year}>{year} season</option>)}
          </select>
        </label>
      </div>
      {rows.length===0? (
        <p className="dp-luck-empty">Not enough completed weekly results to calculate luck for this season.</p>
      ) : (
        <>
          <div className="dp-luck-spotlights">
            {luckiest && <div className="dp-luck-spotlight dp-luck-fortunate">
              <span className="dp-luck-tag">🍀 MOST FORTUNATE</span>
              <strong><Link href={`/owners/${luckiest.ownerId}`}>{luckiest.name}</Link></strong>
              <b>+{fixed(luckiest.luckWins)} wins</b>
              <small>{fixed(luckiest.actualEquivalentWins)} actual vs. {fixed(luckiest.expectedWins)} expected</small>
            </div>}
            {unluckiest && <div className="dp-luck-spotlight dp-luck-unfortunate">
              <span className="dp-luck-tag">⚡ TOUGHEST SCHEDULE LUCK</span>
              <strong><Link href={`/owners/${unluckiest.ownerId}`}>{unluckiest.name}</Link></strong>
              <b>{unluckiest.luckWins>0?"+":""}{fixed(unluckiest.luckWins)} wins</b>
              <small>{fixed(unluckiest.actualEquivalentWins)} actual vs. {fixed(unluckiest.expectedWins)} expected</small>
            </div>}
          </div>
          <div className="dp-luck-table-scroll">
            <table className="dp-luck-table">
              <thead><tr>
                <th>Rank</th><th>Owner</th><th>Actual W-L</th><th>Expected Wins</th>
                <th>All-Play W-L</th><th>Luck +/-</th>
              </tr></thead>
              <tbody>
                {rows.map((owner,i)=><tr key={owner.ownerId}>
                  <td>{i+1}</td>
                  <td><Link href={`/owners/${owner.ownerId}`}>{owner.name}</Link><small>{owner.weeks} scored weeks</small></td>
                  <td>{record(owner.wins,owner.losses,owner.ties)}</td>
                  <td>{fixed(owner.expectedWins)}</td>
                  <td>{record(owner.allPlayWins,owner.allPlayLosses,owner.allPlayTies)}</td>
                  <td><b className={owner.luckWins>0.004?"dp-luck-positive":owner.luckWins<-.004?"dp-luck-negative":""}>{owner.luckWins>0?"+":""}{fixed(owner.luckWins)}</b></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="dp-luck-explainer">
        <strong>How luck works:</strong> In a 10-team week, the highest scorer earns 1.00 expected win, the lowest earns 0.00, and the fifth-ranked scorer earns 0.56. Actual wins (ties count as half) minus expected wins = schedule luck. Positive means more wins than the scoring deserved; negative means fewer. Only completed regular-season weeks with nearly all teams' scores are included. This is descriptive, not a prediction.
      </p>
    </div>
  );
}
