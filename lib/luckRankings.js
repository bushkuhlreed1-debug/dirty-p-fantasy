// All-play luck calculation from completed, regular-season fantasy matchups.
// The difference in wins is actual result W+0.5T minus all-play expected W.
// Only reasonably complete scoring weeks enter the comparison.

function numeric(value) {
  return value === null || value === undefined || value === "" ||
    !Number.isFinite(Number(value)) ? null : Number(value);
}
function freshRow(ownerId,name) {
  return { ownerId,name,weeks:0,wins:0,losses:0,ties:0,
    allPlayWins:0,allPlayLosses:0,allPlayTies:0,expectedWins:0,actualEquivalentWins:0,luckWins:0 };
}
function output(rows) {
  return [...rows.values()].filter(x=>x.weeks>0)
    .map(x=>({...x,
      expectedWins:Number(x.expectedWins.toFixed(2)),
      actualEquivalentWins:Number(x.actualEquivalentWins.toFixed(2)),
      luckWins:Number((x.actualEquivalentWins-x.expectedWins).toFixed(2))
    }))
    .sort((a,b)=>b.luckWins-a.luckWins || b.allPlayWins-a.allPlayWins || a.name.localeCompare(b.name));
}
export function buildLuckRankings(regularGames, owners) {
  const names=new Map((owners||[]).map(o=>[Number(o.id),o.name]));
  const groups=new Map();
  const seen=new Set();
  for(const g of regularGames||[]) {
    const year=numeric(g.season_year),week=numeric(g.matchup_period);
    const home=Number(g.home_owner_id),away=Number(g.away_owner_id);
    const hs=numeric(g.home_score),as=numeric(g.away_score);
    if(!year||!week||!home||!away||home===away||hs===null||as===null||
      (hs===0&&as===0))continue;
    const k=[year,week,...[home,away].sort((a,b)=>a-b)].join(":");
    if(seen.has(k))continue;
    seen.add(k);
    const groupKey=year+":"+week;
    if(!groups.has(groupKey))groups.set(groupKey,{year,week,games:[]});
    groups.get(groupKey).games.push({home,away,hs,as});
  }
  const countByYear=new Map();
  for(const {year,games} of groups.values()){
    const ids=new Set(games.flatMap(g=>[g.home,g.away]));
    countByYear.set(year,Math.max(countByYear.get(year)||0,ids.size));
  }
  const allTime=new Map(),byYear=new Map(),includedWeeks=new Map();
  for(const {year,week,games} of groups.values()){
    const participants=new Map(),actual=new Map();
    let duplicate=false;
    for(const g of games){
      if(participants.has(g.home)||participants.has(g.away)){duplicate=true;break;}
      participants.set(g.home,g.hs);participants.set(g.away,g.as);
      actual.set(g.home,Math.sign(g.hs-g.as));
      actual.set(g.away,Math.sign(g.as-g.hs));
    }
    const maxSize=countByYear.get(year)||0;
    if(duplicate||participants.size<Math.max(4,Math.ceil(maxSize*.9)))continue;
    includedWeeks.set(year,(includedWeeks.get(year)||0)+1);
    if(!byYear.has(year))byYear.set(year,new Map());
    const scores=[...participants.entries()];
    for(const [id,score] of scores){
      let wins=0,losses=0,ties=0;
      for(const [otherId,otherScore] of scores) {
        if(id===otherId)continue;
        if(score>otherScore)wins++;
        else if(score<otherScore)losses++;
        else ties++;
      }
      const result=actual.get(id);
      const expected=(wins+ties*.5)/(scores.length-1);
      const actualEquivalent=result===0?.5:result>0?1:0;
      for(const rows of [allTime,byYear.get(year)]){
        if(!rows.has(id))rows.set(id,freshRow(id,names.get(id)||"Owner "+id));
        const row=rows.get(id);
        row.weeks++;
        row.wins+=result>0?1:0;
        row.losses+=result<0?1:0;
        row.ties+=result===0?1:0;
        row.allPlayWins+=wins;row.allPlayLosses+=losses;row.allPlayTies+=ties;
        row.expectedWins+=expected;
        row.actualEquivalentWins+=actualEquivalent;
      }
    }
  }
  const seasons=[...byYear.keys()].sort((a,b)=>b-a);
  return {seasons,allTime:output(allTime),bySeason:Object.fromEntries(
    seasons.map(y=>[y,output(byYear.get(y))])),
    includedWeeks:Object.fromEntries(includedWeeks)};
}
