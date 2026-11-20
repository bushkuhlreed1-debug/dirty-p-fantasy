// Real memorable results from the corresponding week in past Dirty P seasons.
// This uses only finalized historical regular-season matchups; no guessed comebacks.

function val(value){
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? null : Number(value);
}
function isRegular(game){
  const type=String(game.matchup_type||"").toLowerCase();
  const tier=String(game.playoff_tier||"").toLowerCase();
  return !game.is_playoff&&!game.is_consolation&&!game.is_championship&&!game.is_third_place &&
    !/playoff|championship|semi.?final|third.?place|3rd.?place|consolation|loser|toilet/.test(type) &&
    !/winner|championship|consolation|loser|toilet/.test(tier);
}
function gameId(game){
  return [game.season_year,game.matchup_period,...[game.home_owner_id,game.away_owner_id].sort((a,b)=>Number(a)-Number(b))].join(":");
}
export function buildWeekHistory({games=[],owners=[],week,currentSeason}) {
  const names=new Map(owners.map(o=>[Number(o.id),o.name]));
  const seen=new Set();
  const eligible=[];
  for(const g of games){
    const year=val(g.season_year), period=val(g.matchup_period);
    const hs=val(g.home_score),as=val(g.away_score);
    const home=Number(g.home_owner_id),away=Number(g.away_owner_id);
    if(!year||year>=currentSeason||period!==Number(week)||hs===null||as===null||
      !home||!away||home===away||(hs===0&&as===0)||!isRegular(g))continue;
    const id=gameId(g);if(seen.has(id))continue;seen.add(id);
    eligible.push({id,year,week:period,home,away,hs,as,margin:Math.abs(hs-as)});
  }
  if(!eligible.length)return [];
  const format=v=>Number(v).toFixed(2);
  const owner=id=>names.get(id)||"Owner "+id;
  const actualWinner=g=>g.hs>g.as?owner(g.home):g.as>g.hs?owner(g.away):"Neither";
  const opponent=g=>g.hs>g.as?owner(g.away):owner(g.home);
  const picks=[
    {
      tag:"CLOSEST FINISH",
      pick:[...eligible].filter(g=>g.margin>0).sort((a,b)=>a.margin-b.margin||b.year-a.year)[0],
      build:g=>({
        title:actualWinner(g)+" survived a "+format(g.margin)+"-point thriller",
        detail:actualWinner(g)+" edged "+opponent(g)+" "+format(Math.max(g.hs,g.as))+" to "+format(Math.min(g.hs,g.as))+"."
      })
    },
    {
      tag:"BIGGEST BLOWOUT",
      pick:[...eligible].filter(g=>g.margin>0).sort((a,b)=>b.margin-a.margin||b.year-a.year)[0],
      build:g=>({
        title:actualWinner(g)+" delivered a "+format(g.margin)+"-point beating",
        detail:actualWinner(g)+" beat "+opponent(g)+" "+format(Math.max(g.hs,g.as))+" to "+format(Math.min(g.hs,g.as))+"."
      })
    },
    {
      tag:"HIGHEST SINGLE SCORE",
      pick:[...eligible].sort((a,b)=>Math.max(b.hs,b.as)-Math.max(a.hs,a.as)||b.year-a.year)[0],
      build:g=>{
        const scorer=g.hs>=g.as?owner(g.home):owner(g.away);
        return {title:scorer+" dropped "+format(Math.max(g.hs,g.as))+" points",
          detail:scorer+" scored "+format(Math.max(g.hs,g.as))+" against "+(g.hs>=g.as?owner(g.away):owner(g.home))+
            " ("+format(Math.min(g.hs,g.as))+" points)."};
      }
    }
  ];
  const used=new Set(),moments=[];
  for(const p of picks){
    if(!p.pick||used.has(p.pick.id))continue;
    used.add(p.pick.id);
    moments.push({
      key:p.pick.id,label:p.tag,year:p.pick.year,week:p.pick.week,
      ...p.build(p.pick)
    });
  }
  return moments;
}
