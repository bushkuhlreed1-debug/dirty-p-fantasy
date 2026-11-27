import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";
import { getEspnLiveScoreMap } from "../../lib/espnLiveScore";
import WeekPicker from "./WeekPicker";
import "./scoreboard.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly Scoreboards | Dirty P" };

function Matchup({ game, owners, liveScores, teams }) {
  function side(location) {
    const id = Number(game[`${location}_owner_id`]);
    const score = (!game.completed ? liveScores.get(teams.get(id))?.currentPoints : null)
      ?? game[`${location}_score`];
    return { id, name: owners.get(id), team: game[`${location}_team_name`], score };
  }

  const away = side("away");
  const home = side("home");
  const hasScore = away.score != null && home.score != null && (Number(away.score) !== 0 || Number(home.score) !== 0);
  const final = hasScore && game.completed;
  const stage = game.is_championship ? "Championship"
    : game.is_third_place ? "Third place"
    : game.is_consolation ? "Consolation"
    : game.is_playoff ? "Playoffs" : null;

  return (
    <article className="weekly-board-game">
      <div className="weekly-board-game-label">
        <strong>{final ? "Final" : hasScore ? "In progress" : "Scheduled"}</strong>
        {stage && <span>{stage}</span>}
      </div>
      {[away, home].map((team, index, rows) => {
        const won = final && Number(team.score) > Number(rows[1 - index].score);
        return (
          <div className={`weekly-board-team${won ? " weekly-board-winner" : ""}`} key={team.id}>
            <div>
              <Link href={`/owners/${team.id}`}>{team.name || team.team || "Unknown owner"}</Link>
              {team.name && team.team && <small>{team.team}</small>}
            </div>
            <strong>{hasScore ? Number(team.score).toFixed(2) : "—"}</strong>
          </div>
        );
      })}
    </article>
  );
}

export default async function WeeklyScoreboard({ searchParams }) {
  const filters = await searchParams;
  const league = await getLeagueData();
  const { currentSeason: season, currentSeasonMatchups: seasonGames } = league;
  const weeks = [...new Set(seasonGames.map(game => Number(game.matchup_period)))].filter(week => week > 0).sort((a, b) => a - b);
  const requestedWeek = Number(filters?.week);
  const week = weeks.includes(requestedWeek) ? requestedWeek
    : weeks.includes(league.currentWeek) ? league.currentWeek : weeks.at(-1);
  const liveScores = week === league.currentWeek
    ? await getEspnLiveScoreMap(season, week)
    : new Map();
  const owners = new Map(league.owners.map(owner => [Number(owner.id), owner.name]));
  const teams = new Map(league.currentTeams.map(team => [Number(team.owner_id), Number(team.espn_team_id)]));
  const matchups = seasonGames.filter(game => Number(game.matchup_period) === week);

  return (
    <main className="page-shell weekly-board">
      <section className="owners-hero">
        <div>
          <h1>Weekly Scoreboards</h1>
          <p>Browse every week of the {season} Dirty P season.</p>
        </div>
        <Link href="/#live-scoreboard">Live scoreboard on Home →</Link>
      </section>
      {weeks.length > 0 && <WeekPicker weeks={weeks} week={week} />}
      {matchups.length ? (
        <section className="owners-section" aria-labelledby="weekly-board-title">
          <div className="section-heading"><h2 id="weekly-board-title">{season} · Week {week}</h2></div>
          <div className="weekly-board-grid">
            {matchups.map(game => <Matchup key={game.id} game={game} owners={owners} teams={teams}
              liveScores={liveScores} />)}
          </div>
        </section>
      ) : <p>No matchups available.</p>}
    </main>
  );
}
