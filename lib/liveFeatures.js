// Live Record Watch and playoff-race model. All records come from Dirty P's
// historical database. Playoff changes are *model estimates*, not ESPN odds.

const num = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const val = v => num(v) ?? 0;
const round = v => Number(v.toFixed(1));

function regular(game) {
  const type = String(game?.matchup_type || "").toLowerCase();
  const tier = String(game?.playoff_tier || "").toLowerCase();
  return !game?.is_playoff && !game?.is_consolation &&
    !game?.is_championship && !game?.is_third_place &&
    !/playoff|championship|semi.?final|third.?place|consolation|loser|toilet/.test(type) &&
    !/winner|championship|consolation|loser|toilet/.test(tier);
}

function actualScore(game, ownerId) {
  if (Number(game?.home_owner_id) === ownerId) return num(game.home_score);
  if (Number(game?.away_owner_id) === ownerId) return num(game.away_score);
  return null;
}
function final(game) {
  return game?.completed === true || game?.is_final === true ||
    ["HOME","AWAY","TIE"].includes(String(game?.winner || "").toUpperCase());
}
function liveTotal(ownerId, game, teams, scores, projected = false) {
  const team = teams.get(ownerId);
  const live = scores.get(Number(team?.espn_team_id));
  const current = num(projected ? live?.liveProjectedPoints : live?.currentPoints);
  return current ?? (!projected && final(game) ? actualScore(game,ownerId) : null);
}

export function buildRecordWatches(league, week, liveScores) {
  const history = (league.historicalMatchups || []).filter(g =>
    regular(g) && num(g.home_score) !== null && num(g.away_score) !== null &&
    (num(g.home_score) > 0 || num(g.away_score) > 0));
  if (!history.length) return [];

  const ownerNames = new Map((league.owners || []).map(o => [Number(o.id),o.name]));
  const teamMap = new Map((league.currentTeams || []).map(t => [Number(t.owner_id),t]));
  const seasonResults = (league.historicalSeasonResults || []).filter(x => num(x.points_for) !== null);

  let weeklyRecord = null, marginRecord = null, seasonRecord = null;
  for (const game of history) {
    for (const id of [Number(game.home_owner_id),Number(game.away_owner_id)]) {
      const pts = actualScore(game,id);
      if (pts !== null && (!weeklyRecord || pts > weeklyRecord.pts))
        weeklyRecord = {pts, owner:ownerNames.get(id)||"Past owner",year:game.season_year,week:game.matchup_period};
    }
    const gap = Math.abs(val(game.home_score)-val(game.away_score));
    if (gap>0 && (!marginRecord || gap>marginRecord.pts)) {
      const winner = val(game.home_score)>val(game.away_score)?game.home_owner_id:game.away_owner_id;
      marginRecord = {pts:gap,owner:ownerNames.get(Number(winner))||"Past owner",year:game.season_year};
    }
  }
  for (const row of seasonResults) {
    const pts = num(row.points_for);
    if (pts!==null && (!seasonRecord || pts>seasonRecord.pts))
      seasonRecord={pts,owner:ownerNames.get(Number(row.owner_id))||"Past owner",year:row.season_year};
  }
  const activeGames = (league.currentSeasonMatchups || []).filter(g =>
    Number(g.matchup_period)===Number(week) && regular(g));
  const watches = [];

  if (weeklyRecord) for (const g of activeGames) {
    for (const id of [Number(g.home_owner_id),Number(g.away_owner_id)]) {
      const actual = liveTotal(id,g,teamMap,liveScores);
      const projected = liveTotal(id,g,teamMap,liveScores,true);
      if (actual===null || (actual<weeklyRecord.pts-20 && (projected===null || projected<weeklyRecord.pts-15))) continue;
      const name=ownerNames.get(id)||"An owner";
      watches.push({kind:"week",label:"HIGHEST WEEKLY SCORE",title:name+" is chasing the weekly scoring record",
        description:(final(g)?"Final score":"Live score")+" vs "+weeklyRecord.owner+"'s "+weeklyRecord.year+" Week "+weeklyRecord.week+" record",
        current:round(actual),record:round(weeklyRecord.pts),
        distance:round(Math.max(0,weeklyRecord.pts-actual)),surpassed:actual>weeklyRecord.pts,
        final:final(g),urgency:Math.abs(weeklyRecord.pts-(projected??actual))});
    }
  }

  if (marginRecord) for(const g of activeGames) {
    const home=Number(g.home_owner_id), away=Number(g.away_owner_id);
    const h=liveTotal(home,g,teamMap,liveScores), a=liveTotal(away,g,teamMap,liveScores);
    const hp=liveTotal(home,g,teamMap,liveScores,true), ap=liveTotal(away,g,teamMap,liveScores,true);
    if (h===null || a===null) continue;
    const margin=Math.abs(h-a), projectedGap=hp!==null&&ap!==null?Math.abs(hp-ap):margin;
    if (margin < marginRecord.pts-12 && projectedGap < marginRecord.pts-10) continue;
    const leader= h>=a?home:away;
    watches.push({kind:"margin",label:"LARGEST WIN MARGIN",title:(ownerNames.get(leader)||"An owner")+" is approaching the blowout record",
      description:"Matchup margin vs the all-time "+round(marginRecord.pts)+"-point win",
      current:round(margin),record:round(marginRecord.pts),distance:round(Math.max(0,marginRecord.pts-margin)),
      surpassed:margin>marginRecord.pts,final:final(g),urgency:Math.abs(marginRecord.pts-projectedGap)});
  }

  if (seasonRecord) for(const team of (league.currentTeams||[])) {
    const pts=num(team.points_for);
    if(pts===null || pts<seasonRecord.pts-35) continue;
    const name=ownerNames.get(Number(team.owner_id))||"An owner";
    watches.push({kind:"season",label:"SEASON POINTS RECORD",title:name+" is nearing the season points record",
      description:"Current season points vs "+seasonRecord.owner+"'s "+seasonRecord.year+" mark",
      current:round(pts),record:round(seasonRecord.pts),distance:round(Math.max(0,seasonRecord.pts-pts)),
      surpassed:pts>seasonRecord.pts,final:false,urgency:Math.abs(seasonRecord.pts-pts)});
  }
  return watches.sort((a,b)=>(Number(b.surpassed)-Number(a.surpassed))||a.urgency-b.urgency).slice(0,3);
}

function seedRandom(seed) {
  let x=seed>>>0;
  return () => {
    x=(x+0x6d2b79f5)>>>0;
    let z=x;z=Math.imul(z^(z>>>15),z|1);
    z^=z+Math.imul(z^(z>>>7),z|61);
    return ((z^(z>>>14))>>>0)/4294967296;
  };
}
function strengthChance(a,b) {
  const rating=t=>{
    const played=val(t.wins)+val(t.losses)+val(t.ties);
    const winPct=played?(val(t.wins)+val(t.ties)*.5)/played:.5;
    const perGame=played?val(t.points_for)/played:105;
    return (winPct-.5)*.38 + Math.max(-.16,Math.min(.16,(perGame-105)/320));
  };
  return Math.min(.86,Math.max(.14,.5+rating(a)-rating(b)));
}
function playoffIds(teams,count) {
  const compare=(a,b)=> {
    const pa=val(a.wins)+val(a.losses)+val(a.ties);
    const pb=val(b.wins)+val(b.losses)+val(b.ties);
    const pctA=pa?(val(a.wins)+val(a.ties)*.5)/pa:0;
    const pctB=pb?(val(b.wins)+val(b.ties)*.5)/pb:0;
    return pctB-pctA || val(b.wins)-val(a.wins) ||
      val(b.points_for)-val(a.points_for) || Number(a.owner_id)-Number(b.owner_id);
  };
  const divisions=new Map();
  for(const t of teams) {
    if(t.division_id===undefined || t.division_id===null) continue;
    const id=String(t.division_id);
    if(!divisions.has(id))divisions.set(id,[]);
    divisions.get(id).push(t);
  }
  if(divisions.size!==2 || teams.some(t=>t.division_id===undefined || t.division_id===null))
    return new Set([...teams].sort(compare).slice(0,count).map(t=>Number(t.owner_id)));
  const champions=[...divisions.values()].map(ts=>[...ts].sort(compare)[0]).sort(compare);
  const chosen=new Set(champions.slice(0,count).map(t=>Number(t.owner_id)));
  for(const t of [...teams].filter(t=>!chosen.has(Number(t.owner_id))).sort(compare).slice(0,count-chosen.size))
    chosen.add(Number(t.owner_id));
  return chosen;
}
export function buildPlayoffPulse(league, week, liveScores, weekStarted) {
  const count=Number(league.playoffTeamCount||4);
  const teams=(league.currentTeams || []).map(t=>({...t}));
  if(!weekStarted || teams.length<count+1 || week>13 || !liveScores?.size)return null;
  const byId=new Map(teams.map(t=>[Number(t.owner_id),t]));
  const games=(league.currentSeasonMatchups || []).filter(g=>
    regular(g) && !final(g) && Number(g.matchup_period)>=week &&
    Number(g.matchup_period)<=13 && byId.has(Number(g.home_owner_id)) &&
    byId.has(Number(g.away_owner_id)));
  if(!games.length)return null;
  const currentWeekGames=games.filter(g=>Number(g.matchup_period)===Number(week));
  if(!currentWeekGames.some(g=>{
    const h=byId.get(Number(g.home_owner_id)),a=byId.get(Number(g.away_owner_id));
    return num(liveScores.get(Number(h?.espn_team_id))?.liveProjectedPoints)!==null &&
      num(liveScores.get(Number(a?.espn_team_id))?.liveProjectedPoints)!==null;
  }))return null;
  const chances=games.map(g=>{
    const h=byId.get(Number(g.home_owner_id)),a=byId.get(Number(g.away_owner_id));
    const baseline=strengthChance(h,a);
    if(Number(g.matchup_period)!==Number(week))return {baseline,live:baseline};
    const hp=num(liveScores.get(Number(h?.espn_team_id))?.liveProjectedPoints);
    const ap=num(liveScores.get(Number(a?.espn_team_id))?.liveProjectedPoints);
    if(hp===null||ap===null)return {baseline,live:baseline};
    // A projected-point edge is informative but never a guaranteed win.
    const live=Math.max(.04,Math.min(.96,.5+(hp-ap)/(Math.abs(hp-ap)+42)*.46));
    return {baseline,live};
  });
  const rounds=1800;
  const totals=new Map(teams.map(t=>[Number(t.owner_id),{baseline:0,live:0}]));
  const random=seedRandom(239832+Number(league.currentSeason||2026)+week);
  for(let i=0;i<rounds;i++) {
    const randomDraws=chances.map(()=>random());
    for(const mode of ["baseline","live"]) {
      const sample=teams.map(t=>({...t}));
      const byOwner=new Map(sample.map(t=>[Number(t.owner_id),t]));
      games.forEach((g,j)=>{
        const winner=randomDraws[j]<chances[j][mode]?Number(g.home_owner_id):Number(g.away_owner_id);
        const loser=winner===Number(g.home_owner_id)?Number(g.away_owner_id):Number(g.home_owner_id);
        byOwner.get(winner).wins=val(byOwner.get(winner).wins)+1;
        byOwner.get(loser).losses=val(byOwner.get(loser).losses)+1;
      });
      const field=playoffIds(sample,count);
      for(const id of field) totals.get(id)[mode]++;
    }
  }
  const owners=new Map((league.owners||[]).map(o=>[Number(o.id),o.name]));
  const movers=teams.map(t=>{
    const counts=totals.get(Number(t.owner_id));
    const modelBaseline = counts.baseline/rounds;
    const modelLive = counts.live/rounds;
    const espn = num(t.espn_playoff_pct);
    // ESPN is our reference where available (expressed as 0..1).
    // Use a log-odds shift so the alternative live matchup projection
    // is *anchored to ESPN* instead of showing unrelated model odds.
    // This is a conditional estimate, not an observed odds movement.
    const clamp = p => Math.max(0.0001,Math.min(0.9999,p));
    const logit = p => Math.log(clamp(p)/(1-clamp(p)));
    const logistic = z => 1/(1+Math.exp(-z));
    const reference = espn===null ? modelBaseline : Math.max(0,Math.min(1,espn));
    const liveEstimate = espn===null
      ? modelLive
      : modelLive<=0||modelLive>=1
        ? modelLive
        : logistic(logit(reference)+logit(modelLive)-logit(modelBaseline));
    const before=Math.round(reference*100);
    const after=Math.round(liveEstimate*100);
    return {ownerId:Number(t.owner_id),name:owners.get(Number(t.owner_id))||t.owner_name||"Owner",
      seed:Number(t.playoff_seed||0),before,after,change:after-before,
      baselineSource:espn===null?"Model baseline":"ESPN published"};
  }).sort((a,b)=>{
    // Include every league owner, regardless of seed or odds movement.
    // Order the playoff field and the rest of the standings consistently.
    const aSeed=a.seed>0?a.seed:Number.MAX_SAFE_INTEGER;
    const bSeed=b.seed>0?b.seed:Number.MAX_SAFE_INTEGER;
    return aSeed-bSeed || a.name.localeCompare(b.name);
  });
  if(!movers.length)return null;
  return {week,count,movers,runs:rounds};
}
