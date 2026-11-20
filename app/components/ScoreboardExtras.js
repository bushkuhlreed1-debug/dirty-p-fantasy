import Link from "next/link";

const number = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const fmt = value => number(value) == null ? "—" : Number(value).toFixed(2);
const lineup = side => Array.isArray(side?.startingLineup) ? side.startingLineup : Array.isArray(side?.starters) ? side.starters : [];
const first = name => String(name || "Team").split(" ")[0];
const gameState = (player, games) => games[String(player.nflTeam || "").toUpperCase()]?.state || "unknown";
const counts = (side,games) => lineup(side).reduce((acc,p) => {acc[gameState(p,games)]++;return acc;}, {pre:0,in:0,post:0,unknown:0});
function build(game,games) {
  const sides = [
    {name:game.awayName, standing:game.awayStanding, live:game.awayLive, intel:game.awayIntel, fallback:game.game?.away_score},
    {name:game.homeName, standing:game.homeStanding, live:game.homeLive, intel:game.homeIntel, fallback:game.game?.home_score}
  ].map(s=>({...s,score:number(s.live?.currentPoints ?? s.fallback),projection:number(s.live?.liveProjectedPoints ?? s.intel?.projectedPoints),counts:counts(s.live,games)}));
  const [a,b] = sides;
  const final = game.game?.is_final === true || game.game?.isFinal === true || String(game.game?.status||"").toLowerCase()==="final";
  const margin = a.projection != null && b.projection != null ? Math.abs(a.projection-b.projection) : null;
  const scoreMargin = a.score != null && b.score != null ? Math.abs(a.score-b.score) : null;
  const predictedWinner = margin != null ? (a.projection >= b.projection ? 0 : 1) : null;
  const leader = a.score != null && b.score != null && a.score !== b.score ? (a.score>b.score ? 0 : 1) : null;
  const seedA=number(a.standing?.seed),seedB=number(b.standing?.seed);
  const upset=leader != null && seedA != null && seedB != null && (leader===0 ? seedA>seedB : seedB>seedA);
  const playerRows=sides.flatMap(s=>lineup(s.live).map(p=>({name:p.name||p.fullName,owner:s.name,points:number(p.currentPoints ?? p.actualPoints),projected:number(p.projectedPoints),state:gameState(p,games)})));
  const scoring=playerRows.filter(p=>p.points != null).sort((a,b)=>b.points-a.points);
  const finished=playerRows.filter(p=>p.points != null && p.projected != null && p.state==="post").sort((a,b)=>(a.points-a.projected)-(b.points-b.projected));
  const mvp=scoring[0]||null, bust=finished[0]||null;
  // An estimated probability, never represented as an ESPN statistic.
  let probability=null;
  if(final && a.score != null && b.score != null) probability=a.score===b.score?50:a.score>b.score?100:0;
  else if([a.score,b.score,a.projection,b.projection].every(v=>v!=null) &&
          sides.every(s=>lineup(s.live).length>0 && s.counts.unknown===0)) {
    const active=a.counts.pre+a.counts.in+b.counts.pre+b.counts.in;
    if(!active) probability=a.score===b.score?50:a.score>b.score?100:0;
    else probability=Math.max(1,Math.min(99,Math.round(100/(1+Math.exp(-(a.projection-b.projection)/(5*Math.sqrt(active)))))));
  }
  const monday=sides.map(s=>lineup(s.live).filter(p=>{
    const info=games[String(p.nflTeam||"").toUpperCase()];
    return info?.state!=="post" && /Mon/i.test(info?.status||"");
  }));
  return {game,sides,final,margin,scoreMargin,leader,predictedWinner,upset,mvp,bust,probability,monday};
}
function implications(row,spots) {
  const [a,b]=row.sides, sa=number(a.standing?.seed),sb=number(b.standing?.seed);
  if(sa == null || sb == null) return "Playoff positions unavailable. See the full scenario simulator.";
  if(sa<=spots && sb<=spots) return "Both teams currently hold playoff positions. This result could influence seeding.";
  if(sa>spots && sb>spots) return "Both teams are outside the current playoff picture; a win would help their records.";
  return "A playoff-position team faces an outside contender. The result may shift the standings.";
}
export default function ScoreboardExtras({matchups=[],games={},week,playoffTeams=4}) {
 const rows=matchups.map(m=>build(m,games));
 if(!rows.length) return null;
 const withMargin=rows.filter(r=>r.margin!=null).sort((a,b)=>a.margin-b.margin);
 const closest=withMargin[0], blowout=withMargin[withMargin.length-1];
 const feed=[];
 for(const row of rows){
   const [a,b]=row.sides;
   if(row.upset)feed.push({type:"UPSET ALERT",headline:row.sides[row.leader].name+" leads "+row.sides[1-row.leader].name,detail:"Lower-ranked team ahead by "+fmt(row.scoreMargin)+" points"});
   if(row.mvp?.points>=20)feed.push({type:"BIG PERFORMANCE",headline:row.mvp.name+" · "+row.mvp.owner,detail:fmt(row.mvp.points)+" fantasy points"});
   if(!row.final && row.scoreMargin!=null && row.scoreMargin<=8)feed.push({type:"CLOSE GAME",headline:a.name+" vs "+b.name,detail:"Separated by "+fmt(row.scoreMargin)+" points"});
   if(!row.final && row.monday.some(m=>m.length))feed.push({type:"MONDAY WATCH",headline:a.name+" vs "+b.name,detail:row.monday.map((m,i)=>m.length?row.sides[i].name+": "+m.map(p=>p.name).join(", "):"").filter(Boolean).join(" · ")});
 }
 if(closest)feed.unshift({type:"PHOTO FINISH",headline:closest.sides.map(s=>s.name).join(" vs "),detail:"Closest projected finish · "+fmt(closest.margin)+" point spread"});
 if(blowout && blowout!==closest)feed.push({type:"BLOWOUT WATCH",headline:blowout.sides.map(s=>s.name).join(" vs "),detail:"Largest projected spread · "+fmt(blowout.margin)+" points"});
 return <section className="dp-extras">
   <div className="dp-redzone">
     <div className="dp-redzone-head"><span className="dp-redzone-pulse"/> <strong>DIRTY P REDZONE</strong><small>Week {week} · League-wide live wire</small></div>
     <p className="dp-extra-note">Live scoreboard highlights, refreshed every 30 seconds. A snapshot of the latest scores, not a historical play-by-play or verified lead-change log.</p>
     <div className="dp-redzone-list">{feed.length ? feed.slice(0,12).map((item,i)=><div className="dp-redzone-event" key={i}><b>{item.type}</b><strong>{item.headline}</strong><span>{item.detail}</span></div>) : <p className="dp-extra-note">Game-day alerts appear when fantasy scores and projections become available.</p>}</div>
   </div>
   <div className="dp-insight-heading"><h3>Matchup Insights</h3><small>Expand a matchup for the full breakdown</small></div>
   <div className="dp-insight-grid">{rows.map((row,i)=>{
     const [a,b]=row.sides;
     return <details key={i} className="dp-insight-card">
       <summary><span><strong>{a.name} vs {b.name}</strong><small>{row.final?"Final":"Week "+week} · {row.margin!=null?"Projected gap "+fmt(row.margin):"Projection unavailable"}</small></span><b>Details +</b></summary>
       <div className="dp-insight-body">
         {row.probability!=null ? <div className="dp-prob"><div className="dp-prob-label"><span>{first(a.name)} {row.probability}%</span><span>{first(b.name)} {100-row.probability}%</span></div><div className="dp-prob-track"><div style={{width:row.probability+"%"}}/></div><small>{row.final?"Final score result":"Estimated win probability · not an ESPN prediction"}</small></div> : <p className="dp-extra-note">Estimated win probability unavailable until complete projections and starter game statuses arrive.</p>}
         <div className="dp-mini-stats">{row.sides.map((s,j)=><div key={j}><strong>{s.name}</strong><span>{s.counts.in} playing · {s.counts.pre} yet to start · {s.counts.post} done{s.counts.unknown?" · "+s.counts.unknown+" unknown":""}</span><small>Proj. {fmt(s.projection)} · Now {fmt(s.score)}</small></div>)}</div>
         <div className="dp-insight-list">
           <p><b>Matchup MVP:</b> {row.mvp?row.mvp.name+" ("+row.mvp.owner+") · "+fmt(row.mvp.points)+" pts":"Not available yet"}</p>
           <p><b>Biggest bust:</b> {row.bust?row.bust.name+" · "+fmt(row.bust.points-row.bust.projected)+" vs projection":"Available after a starter finishes below projection"}</p>
           <p><b>Playoff impact:</b> {implications(row,playoffTeams)} <Link href="/playoff-scenarios">View scenarios</Link></p>
           {row.upset&&<p><b>Upset alert:</b> {row.sides[row.leader].name} is currently ahead despite the lower standings rank.</p>}
           {row.monday.some(m=>m.length)&&<p><b>Monday Night Watch:</b> {row.monday.map((m,j)=>m.length?row.sides[j].name+" has "+m.map(p=>p.name).join(", "):"").filter(Boolean).join(" · ")}{row.scoreMargin!=null?" · Current gap "+fmt(row.scoreMargin)+" points":""}. Exact points needed depend on remaining starters.</p>}
         </div>
       </div>
     </details>
   })}</div>
   <style>{`
     .dp-extras{margin:0 0 24px}.dp-redzone{background:#151c27;border:1px solid #4b3940;border-radius:14px;padding:18px;margin-bottom:20px}
     .dp-redzone-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#fff}.dp-redzone-head strong{font-size:15px;letter-spacing:.5px}.dp-redzone-head small{color:#acb8c8;font-size:11px;margin-left:auto}.dp-redzone-pulse{width:10px;height:10px;border-radius:50%;background:#e94555;box-shadow:0 0 0 4px rgba(233,69,85,.12)}
     .dp-extra-note{font-size:11px;color:#a8b5c6;line-height:1.5;margin:10px 0}.dp-redzone-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
     .dp-redzone-event{display:flex;flex-direction:column;gap:5px;border:1px solid #303e50;border-radius:9px;padding:12px;background:#1e2938;min-width:0}
     .dp-redzone-event b{color:#f07883;font-size:10px;letter-spacing:.7px}.dp-redzone-event strong{color:#f7f8fa;font-size:12px}.dp-redzone-event span{color:#b2c0cf;font-size:11px}
     .dp-insight-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:8px 0 12px}.dp-insight-heading h3{font-size:18px;margin:0;color:#f4f5f7}.dp-insight-heading small{color:#9baabd;font-size:11px}
     .dp-insight-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dp-insight-card{background:#171f2a;border:1px solid #354254;border-radius:11px;min-width:0;overflow:hidden}
     .dp-insight-card>summary{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px;list-style:none}.dp-insight-card>summary::-webkit-details-marker{display:none}
     .dp-insight-card>summary span{display:grid;gap:6px;min-width:0}.dp-insight-card>summary strong{font-size:12px;color:#eff2f6}.dp-insight-card>summary small{font-size:10px;color:#a5b3c4}.dp-insight-card>summary>b{color:#e7c17b;font-size:11px;white-space:nowrap}
     .dp-insight-body{padding:14px;border-top:1px solid #354254}.dp-prob-label{display:flex;justify-content:space-between;font-weight:800;font-size:11px;color:#e9f0f5}.dp-prob-track{height:8px;border-radius:9px;overflow:hidden;background:#d58c72;margin:9px 0}.dp-prob-track>div{background:#6ac6a8;height:100%}.dp-prob small{font-size:10px;color:#9eacba}
     .dp-mini-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.dp-mini-stats>div{display:grid;gap:5px;background:#222e3d;border-radius:8px;padding:10px;min-width:0}.dp-mini-stats strong{font-size:11px;color:#f5f6f8}.dp-mini-stats span,.dp-mini-stats small{font-size:10px;color:#b1c0ce}
     .dp-insight-list p{font-size:11px;color:#b6c3d0;line-height:1.6}.dp-insight-list b{color:#e8c47f}.dp-insight-list a{color:#e8c47f;text-decoration:underline}
     @media(max-width:700px){.dp-redzone-list,.dp-insight-grid{grid-template-columns:1fr}.dp-redzone-head small{margin-left:0}}
   `}</style>
 </section>;
}
