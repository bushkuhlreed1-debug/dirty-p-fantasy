"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const colors=["#f0c575","#64cfa9","#9abaff","#dc9df0","#f2a994",
  "#79cbdb","#d3dd80","#d9a3c7","#b0c6d8","#e6b67e","#8fdbbb","#c7a4e4"];
const firstName=name=>String(name||"").split(" ")[0]||"Owner";

export default function GoatRankingTimeline({ seasons=[], snapshots=[], owners=[] }) {
  const [selectedOwner,setSelectedOwner]=useState("all");
  const [selectedYear,setSelectedYear]=useState(String(seasons.at(-1) || ""));
  const ownerMap=useMemo(()=>new Map(owners.map(x=>[Number(x.id),x.name])),[owners]);
  const seasonIndex=Math.max(0,seasons.indexOf(Number(selectedYear)));
  const current=snapshots[seasonIndex]?.rankings || [];
  const prior=snapshots[seasonIndex-1]?.rankings || [];
  const priorRanks=new Map(prior.map(o=>[Number(o.ownerId),o.rank]));
  const allIds=owners.map(x=>Number(x.id));
  const maxRank=Math.max(5,...snapshots.map(x=>x.rankings.length));
  const left=57,top=35,width=825,height=295;
  const x=index=>left+(seasons.length>1?index/(seasons.length-1)*width:width/2);
  const y=rank=>top+(rank-1)/Math.max(1,maxRank-1)*height;
  const lines=allIds.map((id,index)=>{
    const points=snapshots.map((snapshot,i)=>{
      const row=snapshot.rankings.find(v=>Number(v.ownerId)===id);
      return row?{x:x(i),y:y(row.rank),year:snapshot.year,rank:row.rank,score:row.score}:null;
    }).filter(Boolean);
    return {id,index,name:ownerMap.get(id)||"Owner "+id,points,color:colors[index%colors.length]};
  }).filter(line=>line.points.length>0);

  return (
    <div className="dp-goat-timeline">
      <div className="dp-goat-timeline-filters">
        <div>
          <strong>GOAT rankings, season by season</strong>
          <p>See who climbed or fell in the all-time standings after each season.</p>
        </div>
        <label>Highlight owner
          <select value={selectedOwner} onChange={e=>setSelectedOwner(e.target.value)}>
            <option value="all">All owners</option>
            {owners.map(o=><option key={o.id} value={String(o.id)}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <div className="dp-goat-timeline-chart-wrap">
        <svg viewBox="0 0 940 385" role="img" aria-label="Historical GOAT rankings by year, with first place at the top" className="dp-goat-timeline-chart">
          <text x="6" y="15" fill="var(--dp-gold)" fontSize="12" fontWeight="800">ALL-TIME RANK</text>
          {Array.from({length:maxRank},(_,index)=>index+1).map(rank=>(
            <g key={rank}>
              <line x1={left} x2={left+width} y1={y(rank)} y2={y(rank)}
                stroke={rank===1?"#52694d":"#303f4f"} strokeDasharray={rank===1?"0":"4 6"}/>
              <text x={left-16} y={y(rank)+5} fill="var(--dp-muted)" textAnchor="end" fontSize="13">{rank}</text>
            </g>
          ))}
          {seasons.map((year,i)=>(
            <g key={year}>
              <text x={x(i)} y="357" textAnchor="middle" fill="var(--dp-muted)" fontSize="12">{year}</text>
            </g>
          ))}
          {lines.map(line=>{
            const isSelected=selectedOwner==="all"||selectedOwner===String(line.id);
            const d=line.points.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
            return <g key={line.id} opacity={isSelected?1:.11}>
              <path d={d} stroke={line.color} fill="none" strokeWidth={selectedOwner===String(line.id)?4:2.2} strokeLinejoin="round" strokeLinecap="round">
                <title>{line.name}: {line.points.map(p=>p.year+" #"+p.rank).join(", ")}</title>
              </path>
              {line.points.map(p=><circle key={p.year} cx={p.x} cy={p.y} r={selectedOwner===String(line.id)?5:3} fill={line.color}>
                <title>{line.name} · {p.year} · Rank #{p.rank} · {p.score} GOAT points</title>
              </circle>)}
            </g>;
          })}
        </svg>
      </div>
      <div className="dp-goat-timeline-legend">
        {lines.map(line=><button type="button" key={line.id}
          className={selectedOwner===String(line.id)?"dp-active":""}
          aria-pressed={selectedOwner===String(line.id)}
          onClick={()=>setSelectedOwner(previous=>previous===String(line.id)?"all":String(line.id))}>
          <i style={{backgroundColor:line.color}}/>{firstName(line.name)}
        </button>)}
      </div>
      <div className="dp-goat-timeline-snapshot">
        <div className="dp-goat-timeline-snapshot-heading">
          <div><strong>Standings after {selectedYear}</strong><small>
            Cumulative GOAT points through this season
          </small></div>
          <select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)} aria-label="Choose season for historical GOAT standings">
            {seasons.map(year=><option key={year} value={year}>{year}{year===seasons.at(-1)?" (latest)":""}</option>)}
          </select>
        </div>
        <div className="dp-goat-timeline-standings">
          {current.map(o=>{
            const priorRank=priorRanks.get(Number(o.ownerId));
            const changed=priorRank==null?null:priorRank-o.rank;
            return <div className={"dp-goat-timeline-standing "+(selectedOwner===String(o.ownerId)?"dp-highlighted":"")} key={o.ownerId}>
              <b>#{o.rank}</b>
              <Link href={`/owners/${o.ownerId}`}>{o.name}</Link>
              <small className={changed>0?"dp-goat-up":changed<0?"dp-goat-down":""}>
                {priorRank==null?"NEW":changed===0?"—":changed>0?"▲ "+changed:"▼ "+Math.abs(changed)}
              </small>
              <strong>{o.score} pts</strong>
            </div>;
          })}
        </div>
      </div>
      <p className="dp-goat-timeline-note">
        Calculated using the unchanged GOAT formula and historical season results. Playoff-win points count only qualifying semifinal and championship wins. The latest season may be ongoing, so its standings can change.
      </p>
    </div>
  );
}
