import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { getLeagueData } from "../../lib/leagueData";
import { getEspnLiveScoreMap } from "../../lib/espnLiveScore";
import AutoRefresh from "../components/AutoRefresh";

export const dynamic = "force-dynamic";

const SEASON = 2026;
const WEEK = 11;
const PAIRS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function score(value) {
  const parsed = number(value);
  return parsed === null ? "—" : parsed.toFixed(2);
}
function nameShort(value) {
  return String(value || "").trim().split(" ")[0] || "Owner";
}
function matches(game, a, b) {
  const ids = [Number(game.home_owner_id), Number(game.away_owner_id)];
  return ids.includes(a) && ids.includes(b) && a !== b;
}
function ownerScore(game, id) {
  if (!game) return null;
  if (Number(game.home_owner_id) === id) return number(game.home_score);
  if (Number(game.away_owner_id) === id) return number(game.away_score);
  return null;
}
function gameWinner(game) {
  if (!game) return null;
  const result = String(game.winner || "").toUpperCase();
  if (result === "HOME") return Number(game.home_owner_id);
  if (result === "AWAY") return Number(game.away_owner_id);
  if (result === "TIE") return null;
  const home = number(game.home_score), away = number(game.away_score);
  if (home === null || away === null) return null;
  if (home === away) return null;
  return home > away ? Number(game.home_owner_id) : Number(game.away_owner_id);
}
function margin(game) {
  const h = number(game?.home_score), a = number(game?.away_score);
  return h === null || a === null ? null : Math.abs(h-a);
}
function resultLabel(game, rival) {
  if (!game) return "No result";
  const winner = gameWinner(game);
  return winner === Number(rival.first?.id) ? nameShort(rival.firstName) + " won" :
    winner === Number(rival.second?.id) ? nameShort(rival.secondName) + " won" : "Tied";
}
async function loadHistory() {
  const history = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.from("matchups")
      .select("*").lt("season_year", SEASON)
      .order("season_year", {ascending:true})
      .order("matchup_period", {ascending:true})
      .range(offset, offset+limit-1);
    if (error) throw new Error(error.message);
    history.push(...(data || []));
    if (!data || data.length < limit) return history;
  }
}
function rivalryHistory(allGames, a, b) {
  const meetings = allGames.filter(g => matches(g,a,b)).sort((x,y) =>
    Number(x.season_year)-Number(y.season_year) ||
    Number(x.matchup_period)-Number(y.matchup_period));
  let aWins=0, bWins=0, ties=0, runningId=null, runningCount=0, longest=null, biggest=null;
  for (const game of meetings) {
    const winner = gameWinner(game);
    const isTie = String(game.winner || "").toUpperCase() === "TIE" ||
      (ownerScore(game,a) !== null && ownerScore(game,a) === ownerScore(game,b));
    if (isTie) ties++;
    else if (winner === a) aWins++;
    else if (winner === b) bWins++;
    else continue;

    if (!winner) { runningId=null; runningCount=0; }
    else {
      runningCount = runningId === winner ? runningCount+1 : 1;
      runningId=winner;
      if (!longest || runningCount > longest.count)
        longest={id:winner,count:runningCount};
    }
    const pointGap = margin(game);
    if (pointGap !== null && pointGap > 0 && (!biggest || pointGap > biggest.gap))
      biggest={game,gap:pointGap,id:winner};
  }
  return {
    aWins,bWins,ties,count:aWins+bWins+ties,
    last:meetings.at(-1) || null,
    lastFive:meetings.slice(-5).reverse(),biggest,longest
  };
}
function stakes(rival, playoffSpots) {
  const a = number(rival.firstTeam?.playoff_seed);
  const b = number(rival.secondTeam?.playoff_seed);
  const aRecord = rival.firstTeam ?
    String(rival.firstTeam.wins) + "-" + String(rival.firstTeam.losses) : "—";
  const bRecord = rival.secondTeam ?
    String(rival.secondTeam.wins) + "-" + String(rival.secondTeam.losses) : "—";
  if (!a || !b) return {
    title:"Bragging rights",
    detail:"Both teams can add a win to the rivalry history. Standings data is unavailable."
  };
  const inA=a<=playoffSpots, inB=b<=playoffSpots;
  const nearA=a<=playoffSpots+2, nearB=b<=playoffSpots+2;
  const title=inA && inB ? "Playoff-seeded showdown" :
    nearA && nearB ? "Playoff race matchup" :
    (nearA || nearB) ? "A playoff contender faces a challenger" :
    "Bragging rights on the line";
  return {
    title,
    detail:nameShort(rival.firstName)+" ("+aRecord+", seed #"+a+") vs "+
      nameShort(rival.secondName)+" ("+bRecord+", seed #"+b+"). "+
      "The result counts toward the current standings and all-time series."
  };
}
function buildAwards(rivalries) {
  if (!rivalries.every(r => r.game?.completed === true &&
      ownerScore(r.game,Number(r.first?.id)) !== null &&
      ownerScore(r.game,Number(r.second?.id)) !== null)) return null;
  const scored = rivalries.map(r => ({
    ...r, gap:margin(r.game), winner:gameWinner(r.game)
  }));
  const winners = scored.filter(r => r.winner !== null);
  const blowout=[...winners].sort((a,b)=>b.gap-a.gap)[0];
  const closest=[...scored].sort((a,b)=>a.gap-b.gap)[0];
  const scorers=scored.flatMap(r => [
    {name:r.firstName,pts:ownerScore(r.game,Number(r.first.id))},
    {name:r.secondName,pts:ownerScore(r.game,Number(r.second.id))}
  ]).sort((a,b)=>b.pts-a.pts);
  const upset=winners.map(r => {
    const winnerIsFirst=r.winner === Number(r.first.id);
    const winSeed=number((winnerIsFirst?r.firstTeam:r.secondTeam)?.playoff_seed);
    const loseSeed=number((winnerIsFirst?r.secondTeam:r.firstTeam)?.playoff_seed);
    return {...r,winSeed,loseSeed,seedDifference:winSeed && loseSeed?winSeed-loseSeed:0};
  }).filter(r => r.seedDifference>0).sort((a,b)=>b.seedDifference-a.seedDifference)[0];
  return [
    {label:"Biggest blowout",winner:blowout?nameShort(blowout.winner === Number(blowout.first.id)?
      blowout.firstName:blowout.secondName):"—",detail:blowout?score(blowout.gap)+"-point victory":"No decisive result"},
    {label:"Closest finish",winner:closest?
      nameShort(closest.firstName)+" vs "+nameShort(closest.secondName):"—",
      detail:closest?score(closest.gap)+"-point difference":"Not available"},
    {label:"Highest scoring owner",winner:scorers.length?nameShort(scorers[0].name):"—",
      detail:scorers.length?score(scorers[0].pts)+" fantasy points":"Not available"},
    {label:"Biggest seed upset",winner:upset?nameShort(upset.winner === Number(upset.first.id)?
      upset.firstName:upset.secondName):"No lower-seeded winner",
      detail:upset?"Current seed #"+upset.winSeed+" defeated #"+upset.loseSeed:
        "Based on the current standings",note:"Current seeds, not pregame odds"}
  ];
}

export default async function RivalryWeekPage() {
  const {data:owners,error:ownersError}=await supabase.from("owners").select("id,name");
  if(ownersError) throw new Error(ownersError.message);
  const ownerMap=new Map((owners || []).map(o=>[o.name.trim().toLowerCase(),o]));

  const [history,league]=await Promise.all([
    loadHistory(),
    getLeagueData().catch(error=>{
      console.error("Rivalry Week: current league data unavailable",error);
      return null;
    })
  ]);
  const currentWeek=Number(league?.currentWeek || 0);
  const weekGames=(league?.currentSeasonMatchups || [])
    .filter(g=>Number(g.matchup_period)===WEEK);
  const teams=new Map((league?.currentTeams || []).map(t=>[Number(t.owner_id),t]));
  let liveScores=new Map();
  if(currentWeek===WEEK) {
    try { liveScores=await getEspnLiveScoreMap(SEASON,WEEK); }
    catch(error){console.error("Rivalry Week: live scores unavailable",error);}
  }
  const rivalries=PAIRS.map(([firstName,secondName],index)=>{
    const first=ownerMap.get(firstName.toLowerCase());
    const second=ownerMap.get(secondName.toLowerCase());
    const a=Number(first?.id || 0), b=Number(second?.id || 0);
    const game=first && second ? weekGames.find(g=>matches(g,a,b)) || null : null;
    const firstTeam=teams.get(a) || null;
    const secondTeam=teams.get(b) || null;
    const firstLive=liveScores.get(Number(firstTeam?.espn_team_id)) || null;
    const secondLive=liveScores.get(Number(secondTeam?.espn_team_id)) || null;
    return {
      index,firstName,secondName,first,second,firstTeam,secondTeam,game,
      history: first && second ? rivalryHistory(history,a,b) : null,
      firstScore: game?.completed ? ownerScore(game,a) :
        number(firstLive?.currentPoints) ?? ownerScore(game,a),
      secondScore: game?.completed ? ownerScore(game,b) :
        number(secondLive?.currentPoints) ?? ownerScore(game,b),
      firstProjected: game?.completed?null:number(firstLive?.liveProjectedPoints),
      secondProjected: game?.completed?null:number(secondLive?.liveProjectedPoints)
    };
  });
  const awards=buildAwards(rivalries);
  const allFinal=Boolean(awards);
  return (
    <main className="page-shell">
      <AutoRefresh enabled={currentWeek===WEEK && !allFinal} intervalMs={30000} />
      <header className="site-header">
        <div className="site-title">
          <Link href="/"><strong>DIRTY P FANTASY FOOTBALL</strong></Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>
      <div className="rw2-wrap">
        <div className="rw2-hero">
          <p>2026 SEASON · WEEK 11</p>
          <h1>RIVALRY WEEK</h1>
          <span>Five matchups. Ten owners. Years of bragging rights.</span>
        </div>

        {awards && (
          <section className="rw2-awards" aria-label="Rivalry Week awards">
            <p>WEEK 11 FINAL</p>
            <h2>Rivalry Week Awards</h2>
            <div className="rw2-award-grid">
              {awards.map(award=>(
                <div className="rw2-award" key={award.label}>
                  <small>{award.label}</small>
                  <strong>{award.winner}</strong>
                  <span>{award.detail}</span>
                  {award.note && <em>{award.note}</em>}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="rw2-list">
          {rivalries.map(r=>{
            const h=r.history;
            const aId=Number(r.first?.id), bId=Number(r.second?.id);
            const implications=stakes(r,Number(league?.playoffTeamCount || 4));
            return (
              <details className="rw2-card" key={r.firstName+"-"+r.secondName}>
                <summary>
                  <div className="rw2-top">
                    <span>RIVALRY {String(r.index+1).padStart(2,"0")}</span>
                    <span>{r.game?.completed?"FINAL · WEEK 11":"WEEK 11 · 2026"}</span>
                  </div>
                  <div className="rw2-versus">
                    <div className="rw2-side">
                      <strong>{r.firstName}</strong>
                      {r.game && <b>{score(r.firstScore)}</b>}
                      {r.firstProjected !== null && <small>Proj. {r.firstProjected.toFixed(1)}</small>}
                    </div>
                    <span className="rw2-vs">VS</span>
                    <div className="rw2-side">
                      <strong>{r.secondName}</strong>
                      {r.game && <b>{score(r.secondScore)}</b>}
                      {r.secondProjected !== null && <small>Proj. {r.secondProjected.toFixed(1)}</small>}
                    </div>
                  </div>
                  <div className="rw2-series-glance">
                    {h ? <><span>ALL-TIME SERIES</span><strong>{h.aWins} – {h.bWins}</strong>
                      <small>{h.count} previous meetings{h.ties?" · "+h.ties+" ties":""}</small></> :
                      <span>Series unavailable</span>}
                  </div>
                  <div className="rw2-expand">
                    <span>Rivalry history &amp; what's at stake</span>
                    <span>View details <b aria-hidden="true">⌄</b></span>
                  </div>
                </summary>

                <div className="rw2-details">
                  <div className="rw2-facts">
                    <div>
                      <small>LAST MEETING</small>
                      <strong>{h?.last ? resultLabel(h.last,r) : "No previous meeting"}</strong>
                      {h?.last && <span>{h.last.season_year} · Week {h.last.matchup_period}
                        {ownerScore(h.last,aId)!==null && ownerScore(h.last,bId)!==null?
                          " · "+score(ownerScore(h.last,aId))+"–"+score(ownerScore(h.last,bId)):""}</span>}
                    </div>
                    <div>
                      <small>BIGGEST BLOWOUT</small>
                      <strong>{h?.biggest?score(h.biggest.gap)+" points":"Not available"}</strong>
                      {h?.biggest && <span>{h.biggest.game.season_year} · Won by {h.biggest.id===aId?
                        nameShort(r.firstName):nameShort(r.secondName)}</span>}
                    </div>
                    <div>
                      <small>LONGEST WINNING STREAK</small>
                      <strong>{h?.longest?h.longest.count+" consecutive":"No previous wins"}</strong>
                      {h?.longest && <span>{h.longest.id===aId?nameShort(r.firstName):nameShort(r.secondName)}</span>}
                    </div>
                  </div>

                  <section className="rw2-stakes">
                    <h3>What's at Stake</h3>
                    <strong>{implications.title}</strong>
                    <p>{implications.detail}</p>
                    <small>Playoff context uses current ESPN seeds; it does not claim a clinching scenario.</small>
                  </section>

                  <section className="rw2-history">
                    <h3>Last Five Meetings</h3>
                    {h?.lastFive?.length ? (
                      <ol>{h.lastFive.map((g,i)=>(
                        <li key={String(g.season_year)+"-"+g.matchup_period+"-"+i}>
                          <div><strong>{g.season_year} · Week {g.matchup_period}</strong>
                            <span>{resultLabel(g,r)}</span></div>
                          <b>{ownerScore(g,aId)!==null && ownerScore(g,bId)!==null?
                            score(ownerScore(g,aId))+" – "+score(ownerScore(g,bId)):"Score unavailable"}</b>
                        </li>
                      ))}</ol>
                    ):<p>No previous games in the archive.</p>}
                  </section>
                  <div className="rw2-profiles">
                    {r.first && <Link href={"/owners/"+r.first.id}>{nameShort(r.firstName)}'s profile</Link>}
                    {r.second && <Link href={"/owners/"+r.second.id}>{nameShort(r.secondName)}'s profile</Link>}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </main>
  );
}
