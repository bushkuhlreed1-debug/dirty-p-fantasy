import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";
import ScenarioSimulator from "./ScenarioSimulator";

export const dynamic = "force-dynamic";

const n = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function isFinal(game) {
  return (
    game?.completed === true ||
    game?.is_final === true ||
    String(game?.status || "").toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(
      String(game?.winner || "").toUpperCase()
    )
  );
}

export default async function PlayoffScenariosPage() {
  let league;

  try {
    league = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Playoff Scenarios</h1>
        <p>Unable to load league data.</p>
        <Link href="/">← Back Home</Link>
      </main>
    );
  }

  const {
    currentSeason = 2026,
    currentWeek = 1,
    playoffTeamCount = 4,
    owners = [],
    currentTeams = [],
    currentSeasonMatchups = [],
  } = league;

  const ownerMap = new Map(
    owners.map((owner) => [n(owner.id), owner.name])
  );

  const teams = currentTeams
    .map((team) => {
      const ownerId = n(team.owner_id ?? team.ownerId);

      return {
        ownerId,
        ownerName:
          ownerMap.get(ownerId) ||
          team.owner_name ||
          team.ownerName ||
          "Unknown Owner",

        teamName:
          team.team_name ||
          team.teamName ||
          "Unknown Team",

        divisionId:
          team.division_id ??
          team.divisionId ??
          null,

        divisionName:
          team.division_name ??
          team.divisionName ??
          null,

        wins: n(team.wins),
        losses: n(team.losses),
        ties: n(team.ties),

        pointsFor: n(
          team.points_for ?? team.pointsFor
        ),

        pointsAgainst: n(
          team.points_against ?? team.pointsAgainst
        ),

        seed: n(
          team.playoff_seed ??
          team.playoffSeed ??
          team.seed
        ),
      };
    })
    .filter((team) => team.ownerId > 0);

  const validOwnerIds = new Set(
    teams.map((team) => team.ownerId)
  );

  const remaining = new Map();

  for (const game of currentSeasonMatchups) {
    const week = n(game.matchup_period);
    const homeId = n(game.home_owner_id);
    const awayId = n(game.away_owner_id);

    if (
      week < n(currentWeek) ||
      isFinal(game) ||
      game.is_playoff === true ||
      game.is_consolation === true ||
      game.matchup_type === "playoff" ||
      game.matchup_type === "consolation" ||
      !validOwnerIds.has(homeId) ||
      !validOwnerIds.has(awayId) ||
      homeId === awayId
    ) {
      continue;
    }

    const id = [
      currentSeason,
      week,
      Math.min(homeId, awayId),
      Math.max(homeId, awayId),
    ].join("-");

    remaining.set(id, {
      id,
      week,
      homeId,
      awayId,
    });
  }

  const games = [...remaining.values()].sort(
    (a, b) =>
      a.week - b.week ||
      a.homeId - b.homeId
  );

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            {currentSeason} POSTSEASON
          </p>

          <h1>Playoff Scenarios</h1>

          <p>
            See the playoff odds, choose future
            winners, and find out which results
            matter most to every owner.
          </p>
        </div>

        <div className="owners-count">
          <strong>{playoffTeamCount}</strong>
          <span>PLAYOFF SPOTS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Back to Standings</Link>
        <span>Week {currentWeek}</span>
      </nav>

      <ScenarioSimulator
        teams={teams}
        games={games}
        currentWeek={n(currentWeek)}
        season={n(currentSeason)}
        playoffCount={n(playoffTeamCount) || 4}
      />

      <footer className="site-footer">
        <strong>Dirty P Fantasy Football</strong>
        <span>The League Archive · Est. 2014</span>
        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
