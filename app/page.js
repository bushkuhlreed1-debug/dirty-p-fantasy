import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";
import { getMatchupIntel } from "../lib/matchupIntel";
import { getEspnLiveScoreMap } from "../lib/espnLiveScore";
import AutoRefresh from "./components/AutoRefresh";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;
const PLAYOFF_TEAMS = 4;

const ASSIGNED_RIVALS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

// =====================================================
// HELPERS
// =====================================================

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return null;
  }

  return Number(value);
}

function num(value) {
  return numberOrNull(value) ?? 0;
}

function formatScore(value) {
  const number = numberOrNull(value);

  return number === null
    ? "—"
    : number.toFixed(2);
}

function formatOne(value) {
  const number = numberOrNull(value);

  return number === null
    ? "—"
    : number.toFixed(1);
}

function formatRecord(wins, losses, ties = 0) {
  const base = `${num(wins)}-${num(losses)}`;

  return num(ties)
    ? `${base}-${num(ties)}`
    : base;
}

function firstName(name) {
  return String(name || "").trim().split(" ")[0] || "Owner";
}

function isAssignedRival(a, b) {
  const first = String(a || "").trim().toLowerCase();
  const second = String(b || "").trim().toLowerCase();

  return ASSIGNED_RIVALS.some(([x, y]) => {
    const xName = x.toLowerCase();
    const yName = y.toLowerCase();

    return (
      (first === xName && second === yName) ||
      (first === yName && second === xName)
    );
  });
}

function isCompleted(game) {
  const winner = String(game?.winner || "")
    .trim()
    .toUpperCase();

  return (
    game?.completed === true ||
    game?.is_final === true ||
    String(game?.status || "").toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(winner)
  );
}

function gameWinnerId(game) {
  if (!game || !isCompleted(game)) {
    return null;
  }

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") {
    return Number(game.home_owner_id);
  }

  if (winner === "AWAY") {
    return Number(game.away_owner_id);
  }

  if (
    numberOrNull(game.home_score) === null ||
    numberOrNull(game.away_score) === null
  ) {
    return null;
  }

  if (num(game.home_score) > num(game.away_score)) {
    return Number(game.home_owner_id);
  }

  if (num(game.away_score) > num(game.home_score)) {
    return Number(game.away_owner_id);
  }

  return null;
}

function matchupKey(game) {
  const away = Number(game.away_owner_id);
  const home = Number(game.home_owner_id);

  return `${Math.min(away, home)}-${Math.max(away, home)}`;
}

function getSeries(games, firstId, secondId) {
  let firstWins = 0;
  let secondWins = 0;
  let ties = 0;

  for (const game of games || []) {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    const matches =
      (home === firstId && away === secondId) ||
      (home === secondId && away === firstId);

    if (!matches || !isCompleted(game)) {
      continue;
    }

    const winner = String(game.winner || "")
      .trim()
      .toUpperCase();

    if (winner === "TIE") {
      ties++;
      continue;
    }

    const winnerId = gameWinnerId(game);

    if (winnerId === firstId) firstWins++;
    if (winnerId === secondId) secondWins++;
  }

  return {
    firstWins,
    secondWins,
    ties,
    total: firstWins + secondWins + ties,
  };
}

function getSeriesText(series, firstOwner, secondOwner) {
  if (!series?.total) {
    return "No previous completed meetings";
  }

  if (series.firstWins > series.secondWins) {
    return `${firstOwner} leads the all-time series ${series.firstWins}-${series.secondWins}`;
  }

  if (series.secondWins > series.firstWins) {
    return `${secondOwner} leads the all-time series ${series.secondWins}-${series.firstWins}`;
  }

  return `All-time series tied ${series.firstWins}-${series.secondWins}`;
}

function getTopPlayers(intel, limit = 3) {
  return Array.isArray(intel?.impactPlayers)
    ? intel.impactPlayers.slice(0, limit)
    : [];
}

function getPlayerOutlook(player) {
  if (player?.matchupGrade === "GOOD") return "Favorable";
  if (player?.matchupGrade === "TOUGH") return "Tough";

  return "Matchup";
}

// =====================================================
// STANDINGS
// =====================================================

function buildStandings(currentTeams, results, owners) {
  const ownerMap = new Map(
    (owners || []).map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const resultMap = new Map(
    (results || []).map((result) => [
      Number(result.owner_id),
      result,
    ])
  );

  return (currentTeams || [])
    .map((team) => {
      const ownerId = Number(
        team.owner_id ?? team.ownerId ?? 0
      );

      const result = resultMap.get(ownerId);

      return {
        ownerId,

        ownerName:
          ownerMap.get(ownerId) ||
          team.ownerName ||
          "Unknown Owner",

        teamName:
          team.team_name ||
          team.teamName ||
          "Unknown Team",

        espnTeamId: Number(
          team.espnTeamId ??
          team.espn_team_id ??
          team.id ??
          0
        ),

        seed: num(
          team.playoffSeed ??
          team.playoff_seed ??
          team.seed
        ),

        divisionId:
          team.division_id ??
          team.divisionId ??
          null,

        wins: num(team.wins ?? result?.wins),
        losses: num(team.losses ?? result?.losses),
        ties: num(team.ties ?? result?.ties),

        pointsFor: num(
          team.pointsFor ??
          team.points_for ??
          result?.points_for
        ),

        pointsAgainst: num(
          team.pointsAgainst ??
          team.points_against ??
          result?.points_against
        ),
      };
    })
    .filter((team) => team.ownerId > 0)
    .sort((a, b) => {
      const aSeed = a.seed > 0 ? a.seed : 999;
      const bSeed = b.seed > 0 ? b.seed : 999;

      if (aSeed !== bSeed) {
        return aSeed - bSeed;
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      return b.pointsFor - a.pointsFor;
    });
}

// =====================================================
// PLAYOFF STATUS
// =====================================================

function calculatePlayoffStatuses(standings, playoffCount) {
  const statuses = new Map();
  const divisions = new Map();

  for (const team of standings) {
    if (
      team.divisionId === null ||
      team.divisionId === undefined ||
      team.divisionId === ""
    ) {
      continue;
    }

    const key = String(team.divisionId);

    if (!divisions.has(key)) {
      divisions.set(key, []);
    }

    divisions.get(key).push(team);
  }

  const divisionLeaders = [];

  for (const teams of divisions.values()) {
    const sorted = [...teams].sort((a, b) => {
      const aSeed = a.seed > 0 ? a.seed : 999;
      const bSeed = b.seed > 0 ? b.seed : 999;

      if (aSeed !== bSeed) return aSeed - bSeed;
      if (b.wins !== a.wins) return b.wins - a.wins;

      return b.pointsFor - a.pointsFor;
    });

    if (sorted[0]) {
      divisionLeaders.push(sorted[0]);
    }
  }

  const leaderIds = new Set(
    divisionLeaders.map((team) => team.ownerId)
  );

  const playoffIds = new Set(
    standings
      .filter(
        (team) =>
          team.seed > 0 &&
          team.seed <= playoffCount
      )
      .map((team) => team.ownerId)
  );

  const divisionsAvailable =
    divisions.size === 2 &&
    divisionLeaders.length === 2;

  for (const team of standings) {
    let status = "Outside";

    if (
      divisionsAvailable &&
      leaderIds.has(team.ownerId)
    ) {
      status = "Division Leader";
    } else if (playoffIds.has(team.ownerId)) {
      status = divisionsAvailable
        ? "Wild Card"
        : "Playoff Position";
    }

    statuses.set(team.ownerId, status);
  }

  return statuses;
}

// =====================================================
// LIVE STARTING LINEUPS
// =====================================================

const BENCH_SLOTS = new Set([
  "BE",
  "BN",
  "BENCH",
  "IR",
  "RESERVE",
  "20",
  "21",
]);

const SLOT_NAMES = {
  "0": "QB",
  "2": "RB",
  "3": "RB/WR",
  "4": "WR",
  "5": "WR/TE",
  "6": "TE",
  "16": "D/ST",
  "17": "K",
  "20": "BE",
  "21": "IR",
  "23": "FLEX",
};

function getSlot(entry) {
  const raw =
    entry?.lineupSlot ??
    entry?.lineup_slot ??
    entry?.lineupSlotId ??
    entry?.lineup_slot_id ??
    entry?.slot ??
    null;

  if (raw === null || raw === undefined) {
    return null;
  }

  const value = String(raw).trim().toUpperCase();

  return SLOT_NAMES[value] || value;
}

function getStartingLineup(team) {
  if (!team) return [];

  const entries =
    team.startingLineup ??
    team.starters ??
    team.roster?.entries ??
    team.rosterEntries ??
    team.players ??
    [];

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => {
      if (
        entry?.isStarter === false ||
        entry?.starter === false
      ) {
        return false;
      }

      const slot = getSlot(entry);

      if (slot && BENCH_SLOTS.has(slot)) {
        return false;
      }

      return (
        entry?.isStarter === true ||
        entry?.starter === true ||
        Boolean(slot)
      );
    })
    .map((entry, index) => {
      const player =
        entry?.playerPoolEntry?.player ??
        entry?.player ??
        entry;

      const name =
        player?.fullName ??
        player?.name ??
        player?.displayName ??
        entry?.name ??
        null;

      if (!name) return null;

      const stats = Array.isArray(player?.stats)
        ? player.stats
        : [];

      const actualStat = stats.find(
        (stat) =>
          Number(stat?.statSourceId) === 0 &&
          numberOrNull(stat?.appliedTotal) !== null
      );

      const points =
        numberOrNull(
          entry?.currentPoints ??
          entry?.actualPoints ??
          entry?.livePoints ??
          actualStat?.appliedTotal
        );

      return {
        id:
          player?.id ??
          entry?.playerId ??
          `${name}-${index}`,

        name,
        slot: getSlot(entry),

        position:
          entry?.position ??
          player?.position ??
          null,

        nflTeam:
          entry?.nflTeam ??
          player?.proTeamAbbreviation ??
          null,

        points,
      };
    })
    .filter(Boolean);
}

// =====================================================
// AROUND THE LEAGUE — AUTOMATIC WEEKLY RECAP
//
// Works for every completed week.
//
// Uses actual completed fantasy matchups.
//
// Shows:
// - Highest scorer
// - Biggest blowout
// - Closest matchup
// - Highest combined score
// - Weekly scoring average
// - Every completed matchup result
//
// No fabricated MVPs or upset rankings.
// =====================================================

function buildWeeklyRecap(games, week, ownerMap) {
  const completed = (games || []).filter(
    (game) =>
      Number(game.matchup_period) === Number(week) &&
      isCompleted(game) &&
      numberOrNull(game.home_score) !== null &&
      numberOrNull(game.away_score) !== null
  );

  const seen = new Set();

  const uniqueGames = completed.filter((game) => {
    const key = matchupKey(game);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  if (!uniqueGames.length) {
    return null;
  }

  const results = uniqueGames.map((game) => {
    const homeId = Number(game.home_owner_id);
    const awayId = Number(game.away_owner_id);

    const homeName =
      ownerMap.get(homeId) || "Unknown Owner";

    const awayName =
      ownerMap.get(awayId) || "Unknown Owner";

    const homeScore = num(game.home_score);
    const awayScore = num(game.away_score);

    const winnerId = gameWinnerId(game);

    const tied = homeScore === awayScore;

    const winnerName = tied
      ? "Tie"
      : winnerId === homeId
      ? homeName
      : winnerId === awayId
      ? awayName
      : homeScore > awayScore
      ? homeName
      : awayName;

    const loserName = tied
      ? "Tie"
      : winnerName === homeName
      ? awayName
      : homeName;

    return {
      key: matchupKey(game),
      homeId,
      awayId,
      homeName,
      awayName,
      homeScore,
      awayScore,
      winnerName,
      loserName,
      margin: Math.abs(homeScore - awayScore),
      combined: homeScore + awayScore,
      tied,
    };
  });

  const performances = results.flatMap((game) => [
    {
      ownerId: game.homeId,
      ownerName: game.homeName,
      points: game.homeScore,
    },
    {
      ownerId: game.awayId,
      ownerName: game.awayName,
      points: game.awayScore,
    },
  ]);

  const sortedPerformances = [...performances].sort(
    (a, b) => b.points - a.points
  );

  const decisiveGames = results.filter(
    (game) => !game.tied
  );

  const biggestBlowout = [...decisiveGames].sort(
    (a, b) => b.margin - a.margin
  )[0] || null;

  const closestGame = [...results].sort(
    (a, b) => a.margin - b.margin
  )[0] || null;

  const highestCombined = [...results].sort(
    (a, b) => b.combined - a.combined
  )[0] || null;

  const lowestCombined = [...results].sort(
    (a, b) => a.combined - b.combined
  )[0] || null;

  const totalPoints = performances.reduce(
    (sum, performance) => sum + performance.points,
    0
  );

  const averageScore = performances.length
    ? totalPoints / performances.length
    : 0;

  return {
    week,
    results,
    matchupCount: results.length,
    highestScorer: sortedPerformances[0] || null,
    lowestScorer:
      sortedPerformances[sortedPerformances.length - 1] ||
      null,
    biggestBlowout,
    closestGame,
    highestCombined,
    lowestCombined,
    averageScore,
    totalPoints,
  };
}

// =====================================================
// AROUND THE LEAGUE COMPONENTS
// =====================================================

function RecapHighlight({
  label,
  title,
  value,
  detail,
  featured = false,
}) {
  return (
    <div
      className={`dp-recap-highlight ${
        featured ? "dp-recap-featured" : ""
      }`}
    >
      <span className="dp-recap-label">
        {label}
      </span>

      <strong className="dp-recap-name">
        {title}
      </strong>

      <div className="dp-recap-value">
        {value}
      </div>

      {detail && (
        <p className="dp-recap-detail">
          {detail}
        </p>
      )}
    </div>
  );
}

function AroundTheLeague({ recap }) {
  if (!recap) {
    return null;
  }

  const {
    week,
    results,
    matchupCount,
    highestScorer,
    biggestBlowout,
    closestGame,
    highestCombined,
    lowestCombined,
    averageScore,
  } = recap;

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            WEEK {week} RECAP
          </p>

          <h2>
            Around the League
          </h2>
        </div>

        <span>
          {matchupCount} Final Matchups
        </span>
      </div>

      <div className="dp-recap-intro">
        <strong>
          The Week {week} Rundown
        </strong>

        <p>
          The biggest performances, closest finishes,
          and standout results from Week {week}.
        </p>
      </div>

      <div className="dp-recap-highlights">

        {highestScorer && (
          <RecapHighlight
            featured
            label="🏆 TOP WEEKLY PERFORMANCE"
            title={highestScorer.ownerName}
            value={`${formatScore(
              highestScorer.points
            )} PTS`}
            detail="Highest-scoring fantasy team of the week"
          />
        )}

        {biggestBlowout && (
          <RecapHighlight
            label="💥 BIGGEST BLOWOUT"
            title={biggestBlowout.winnerName}
            value={`${formatScore(
              biggestBlowout.margin
            )}-point win`}
            detail={`Defeated ${firstName(
              biggestBlowout.loserName
            )}`}
          />
        )}

        {closestGame && (
          <RecapHighlight
            label="🔥 CLOSEST MATCHUP"
            title={
              `${firstName(closestGame.awayName)} vs ` +
              `${firstName(closestGame.homeName)}`
            }
            value={
              closestGame.tied
                ? "Tied"
                : `${formatScore(
                    closestGame.margin
                  )}-point margin`
            }
            detail={
              `${formatScore(
                closestGame.awayScore
              )} – ${formatScore(
                closestGame.homeScore
              )}`
            }
          />
        )}

        {highestCombined && (
          <RecapHighlight
            label="🚀 HIGHEST-SCORING MATCHUP"
            title={
              `${firstName(highestCombined.awayName)} vs ` +
              `${firstName(highestCombined.homeName)}`
            }
            value={`${formatScore(
              highestCombined.combined
            )} PTS`}
            detail="Most combined points in a matchup"
          />
        )}

        <RecapHighlight
          label="📊 WEEKLY SCORING AVERAGE"
          title="League Average"
          value={`${formatScore(averageScore)} PTS`}
          detail="Average fantasy team score this week"
        />

        {lowestCombined && (
          <RecapHighlight
            label="🛡️ LOWEST-SCORING MATCHUP"
            title={
              `${firstName(lowestCombined.awayName)} vs ` +
              `${firstName(lowestCombined.homeName)}`
            }
            value={`${formatScore(
              lowestCombined.combined
            )} PTS`}
            detail="Fewest combined points in a matchup"
          />
        )}

      </div>

      {/* EVERY WEEKLY RESULT */}

      <div className="dp-recap-results">
        <div className="dp-recap-results-heading">
          <div>
            <span className="dp-recap-label">
              FULL WEEKLY RESULTS
            </span>

            <h3>
              Week {week} Scoreboard
            </h3>
          </div>

          <span className="dp-recap-final-count">
            {matchupCount} FINAL
          </span>
        </div>

        <div className="dp-recap-results-grid">
          {results.map((game) => {
            const awayWon =
              game.awayScore > game.homeScore;

            const homeWon =
              game.homeScore > game.awayScore;

            return (
              <article
                className="dp-recap-result"
                key={game.key}
              >
                <div className="dp-recap-result-top">
                  <span>FINAL</span>

                  <span>
                    {game.tied
                      ? "TIE"
                      : `${formatScore(
                          game.margin
                        )}-POINT MARGIN`}
                  </span>
                </div>

                <div
                  className={`dp-recap-result-team ${
                    awayWon ? "winner" : ""
                  }`}
                >
                  <Link
                    href={`/owners/${game.awayId}`}
                  >
                    {game.awayName}
                  </Link>

                  <strong>
                    {formatScore(game.awayScore)}
                  </strong>
                </div>

                <div
                  className={`dp-recap-result-team ${
                    homeWon ? "winner" : ""
                  }`}
                >
                  <Link
                    href={`/owners/${game.homeId}`}
                  >
                    {game.homeName}
                  </Link>

                  <strong>
                    {formatScore(game.homeScore)}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// MATCHUP COMPONENTS
// =====================================================

function OwnerMatchupSide({
  owner,
  team,
  standing,
  points,
  projection,
  live,
}) {
  return (
    <div className="dp-matchup-side">
      <Link
        href={`/owners/${owner}`}
        className="dp-owner-link"
      >
        {team}
      </Link>

      <div className="dp-matchup-owner">
        {standing?.ownerName || "Unknown Owner"}
      </div>

      {standing && (
        <div className="dp-matchup-record">
          {formatRecord(
            standing.wins,
            standing.losses,
            standing.ties
          )}
        </div>
      )}

      {numberOrNull(points) !== null && (
        <div className="dp-matchup-score">
          {formatScore(points)}
        </div>
      )}

      {!live &&
        numberOrNull(projection) !== null && (
          <div className="dp-matchup-projection">
            Projected points · {formatOne(projection)}
          </div>
        )}
    </div>
  );
}

function PlayersToWatch({ title, players }) {
  return (
    <div className="dp-players-panel">
      <div className="dp-players-heading">
        {title}
      </div>

      {players.length ? (
        players.map((player, index) => (
          <div
            className="dp-player-row"
            key={player.playerId || index}
          >
            <strong>{player.name}</strong>

            <span>
              {player.position || "Player"}

              {numberOrNull(player.projection) !== null &&
                ` · ${formatOne(
                  player.projection
                )} projected`}

              {player.opponent &&
                ` · vs ${player.opponent}`}

              {` · ${getPlayerOutlook(player)}`}
            </span>
          </div>
        ))
      ) : (
        <div className="dp-player-row">
          <span>
            Player projections unavailable.
          </span>
        </div>
      )}
    </div>
  );
}

function LiveLineup({ title, team }) {
  const starters = getStartingLineup(team);

  return (
    <div className="dp-live-lineup">
      <div className="dp-live-lineup-heading">
        <strong>{title}</strong>

        <span>STARTING LINEUP</span>
      </div>

      {starters.length ? (
        <div className="dp-live-players">
          {starters.map((player) => (
            <div
              className="dp-live-player"
              key={player.id}
            >
              <div className="dp-live-player-slot">
                {player.slot ||
                  player.position ||
                  "—"}
              </div>

              <div className="dp-live-player-info">
                <strong>
                  {player.name}
                </strong>

                <span>
                  {[
                    player.position,
                    player.nflTeam,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Starter"}
                </span>
              </div>

              <div className="dp-live-player-score">
                {formatScore(player.points)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dp-lineup-unavailable">
          Live starting lineup data is
          not currently available.
        </p>
      )}
    </div>
  );
}

function MatchupCard({
  matchup,
  featured = false,
  live = false,
}) {
  const awayPoints =
    matchup.awayLive?.currentPoints ??
    (live ? matchup.game.away_score : null);

  const homePoints =
    matchup.homeLive?.currentPoints ??
    (live ? matchup.game.home_score : null);

  const awayProjection =
    matchup.awayIntel?.projectedPoints;

  const homeProjection =
    matchup.homeIntel?.projectedPoints;

  const awayPlayers = getTopPlayers(
    matchup.awayIntel,
    featured ? 3 : 2
  );

  const homePlayers = getTopPlayers(
    matchup.homeIntel,
    featured ? 3 : 2
  );

  const final = isCompleted(matchup.game);

  return (
    <article
      className={`dp-matchup-card ${
        featured ? "dp-featured-matchup" : ""
      }`}
    >
      <div className="dp-matchup-top">
        <span>
          {matchup.assignedRivals &&
          matchup.week === 11
            ? "RIVALRY WEEK"
            : featured
            ? "FEATURED MATCHUP"
            : `WEEK ${matchup.week}`}
        </span>

        <span>
          {live
            ? final
              ? "FINAL"
              : "LIVE SCORES"
            : "MATCHUP PREVIEW"}
        </span>
      </div>

      <div className="dp-versus-row">
        <OwnerMatchupSide
          owner={matchup.awayId}
          team={
            matchup.awayStanding?.teamName ||
            matchup.awayName
          }
          standing={matchup.awayStanding}
          points={awayPoints}
          projection={awayProjection}
          live={live}
        />

        <div className="dp-versus-label">
          VS
        </div>

        <OwnerMatchupSide
          owner={matchup.homeId}
          team={
            matchup.homeStanding?.teamName ||
            matchup.homeName
          }
          standing={matchup.homeStanding}
          points={homePoints}
          projection={homeProjection}
          live={live}
        />
      </div>

      {live ? (
        <div className="dp-live-lineups-grid">
          <LiveLineup
            title={firstName(matchup.awayName)}
            team={matchup.awayLive}
          />

          <LiveLineup
            title={firstName(matchup.homeName)}
            team={matchup.homeLive}
          />
        </div>
      ) : (
        <>
          {matchup.analysis && (
            <div className="dp-matchup-description">
              {matchup.analysis}
            </div>
          )}

          <div className="dp-series-line">
            {getSeriesText(
              matchup.series,
              matchup.awayName,
              matchup.homeName
            )}
          </div>

          {(awayPlayers.length > 0 ||
            homePlayers.length > 0) && (
            <div className="dp-players-grid">
              <PlayersToWatch
                title={`${firstName(
                  matchup.awayName
                )} · PLAYERS TO WATCH`}
                players={awayPlayers}
              />

              <PlayersToWatch
                title={`${firstName(
                  matchup.homeName
                )} · PLAYERS TO WATCH`}
                players={homePlayers}
              />
            </div>
          )}
        </>
      )}
    </article>
  );
}

// =====================================================
// HOMEPAGE
// =====================================================

export default async function Home() {
  let data;

  try {
    data = await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Dirty P Fantasy Football</h1>

        <p>
          {error?.message ||
            "Unable to load league data."}
        </p>
      </main>
    );
  }

  const {
    currentSeason = CURRENT_SEASON,
    currentWeek = 1,
    playoffTeamCount = PLAYOFF_TEAMS,
    owners = [],
    currentTeams = [],
    currentSeasonResults = [],
    currentSeasonMatchups = [],
    completedCurrentMatchups = [],
    historicalMatchups = [],
    matchups = [],
    unmatchedEspnOwners = [],
  } = data;

  // ===================================================
  // DEFENDING CHAMPION
  // ===================================================

  const { data: previousChampions } =
    await supabase
      .from("seasons")
      .select(`
        year,
        championship_score,
        champion:champion_owner_id(name),
        runner_up:runner_up_owner_id(name)
      `)
      .lt("year", currentSeason)
      .order("year", {
        ascending: false,
      })
      .limit(1);

  const defendingSeason =
    previousChampions?.[0] || null;

  // ===================================================
  // STANDINGS
  // ===================================================

  const standings = buildStandings(
    currentTeams,
    currentSeasonResults,
    owners
  );

  const standingMap = new Map(
    standings.map((team) => [
      team.ownerId,
      team,
    ])
  );

  const ownerMap = new Map(
    owners.map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const playoffCount =
    Number(playoffTeamCount) ||
    PLAYOFF_TEAMS;

  const playoffStatuses =
    calculatePlayoffStatuses(
      standings,
      playoffCount
    );

  // ===================================================
  // COMPLETED WEEKS
  // ===================================================

  const allCompletedMatchups = [
    ...completedCurrentMatchups,
    ...currentSeasonMatchups.filter(isCompleted),
  ];

  const completedByWeek = new Map();

  for (const game of allCompletedMatchups) {
    const week = Number(game.matchup_period);

    if (!Number.isFinite(week) || week < 1) {
      continue;
    }

    if (!isCompleted(game)) {
      continue;
    }

    if (
      numberOrNull(game.home_score) === null ||
      numberOrNull(game.away_score) === null
    ) {
      continue;
    }

    if (!completedByWeek.has(week)) {
      completedByWeek.set(week, new Map());
    }

    completedByWeek
      .get(week)
      .set(matchupKey(game), game);
  }

  const completedWeeks = [
    ...completedByWeek.keys(),
  ].sort((a, b) => b - a);

  const latestCompletedWeek =
    completedWeeks[0] || 0;

  // ===================================================
  // CURRENT MATCHUP WEEK
  //
  // Keep ESPN's current week when possible.
  // This prevents skipping to the next week
  // just because one matchup has finished.
  // ===================================================

  const regularMatchups =
    currentSeasonMatchups.filter(
      (game) =>
        game.is_playoff !== true &&
        game.is_consolation !== true
    );

  const scheduleWeeks = [
    ...new Set(
      regularMatchups
        .map((game) =>
          Number(game.matchup_period)
        )
        .filter(
          (week) =>
            Number.isFinite(week) &&
            week > 0
        )
    ),
  ].sort((a, b) => a - b);

  const espnCurrentWeek =
    Number(currentWeek) || 1;

  const previewWeek =
    scheduleWeeks.includes(espnCurrentWeek)
      ? espnCurrentWeek
      : scheduleWeeks.find(
          (week) =>
            week >= espnCurrentWeek
        ) ||
        scheduleWeeks[scheduleWeeks.length - 1] ||
        espnCurrentWeek;

  const upcomingGames =
    regularMatchups.filter(
      (game) =>
        Number(game.matchup_period) ===
        previewWeek
    );

  // ===================================================
  // MATCHUP INTEL
  // ===================================================

  let matchupIntel = null;

  try {
    matchupIntel =
      await getMatchupIntel(previewWeek);
  } catch (error) {
    console.error(
      "Matchup intel error:",
      error
    );
  }

  // ===================================================
  // LIVE ESPN FANTASY SCORES
  // ===================================================

  let liveScores = new Map();

  try {
    liveScores =
      await getEspnLiveScoreMap(
        currentSeason,
        previewWeek
      );
  } catch (error) {
    console.error(
      "ESPN live score error:",
      error
    );
  }

  const liveScoreValues =
    Array.from(liveScores.values());

  const hasActualFantasyScoring =
    liveScoreValues.some(
      (team) =>
        num(team?.currentPoints) > 0
    );

  const currentWeekCompletedGames =
    currentSeasonMatchups.filter(
      (game) =>
        Number(game.matchup_period) ===
          previewWeek &&
        isCompleted(game)
    );

  const showLiveScoreboard = Boolean(
    matchupIntel?.weekStarted ||
    hasActualFantasyScoring ||
    currentWeekCompletedGames.length > 0
  );

  const showPregamePreviews =
    !showLiveScoreboard;

  // ===================================================
  // WEEKLY RECAP SELECTION
  //
  // Show the latest fully completed week.
  //
  // Hide Around the League when the current
  // week's games are underway.
  //
  // Generate this automatically every week.
  // ===================================================

  const recapWeek = completedWeeks.find(
    (week) => {
      const finishedCount =
        completedByWeek.get(week)?.size || 0;

      const scheduledGames =
        regularMatchups.filter(
          (game) =>
            Number(game.matchup_period) ===
            week
        );

      const scheduledCount = new Set(
        scheduledGames.map(matchupKey)
      ).size;

      // Do not present a partial week's results
      // as though the entire week has finished.
      return (
        finishedCount > 0 &&
        scheduledCount > 0 &&
        finishedCount >= scheduledCount
      );
    }
  ) || null;

  const recapGames = recapWeek
    ? Array.from(
        completedByWeek.get(recapWeek)?.values() ||
        []
      )
    : [];

  const weeklyRecap = recapWeek
    ? buildWeeklyRecap(
        recapGames,
        recapWeek,
        ownerMap
      )
    : null;

  const showAroundTheLeague =
    !showLiveScoreboard &&
    weeklyRecap !== null;

  // ===================================================
  // MATCHUP PLAYER DATA
  // ===================================================

  const teamMap = new Map(
    standings.map((team) => [
      team.ownerId,
      team,
    ])
  );

  function getTeamIntel(ownerId) {
    const team = teamMap.get(ownerId);

    if (
      !team ||
      !matchupIntel?.teamMap
    ) {
      return null;
    }

    return (
      matchupIntel.teamMap.get(
        team.espnTeamId
      ) || null
    );
  }

  function getLiveTeam(ownerId) {
    const team = teamMap.get(ownerId);

    if (!team?.espnTeamId) {
      return null;
    }

    return (
      liveScores.get(
        team.espnTeamId
      ) || null
    );
  }

  // ===================================================
  // GAME OF THE WEEK
  // ===================================================

  const seriesGames = (
    historicalMatchups?.length
      ? historicalMatchups
      : matchups
  ).filter(
    (game) =>
      Number(game.season_year) <
      Number(currentSeason)
  );

  const previewMatchups =
    upcomingGames.map((game) => {
      const awayId =
        Number(game.away_owner_id);

      const homeId =
        Number(game.home_owner_id);

      const awayStanding =
        standingMap.get(awayId);

      const homeStanding =
        standingMap.get(homeId);

      const awayName =
        ownerMap.get(awayId) ||
        "Unknown Owner";

      const homeName =
        ownerMap.get(homeId) ||
        "Unknown Owner";

      const series = getSeries(
        seriesGames,
        awayId,
        homeId
      );

      const awaySeed =
        awayStanding?.seed || 999;

      const homeSeed =
        homeStanding?.seed || 999;

      const awayInPlayoffs =
        awaySeed <= playoffCount;

      const homeInPlayoffs =
        homeSeed <= playoffCount;

      const assignedRivals =
        isAssignedRival(
          awayName,
          homeName
        );

      let hypeScore = 0;

      if (
        awayInPlayoffs &&
        homeInPlayoffs
      ) {
        hypeScore += 15;
      } else if (
        awayInPlayoffs ||
        homeInPlayoffs
      ) {
        hypeScore += 7;
      }

      hypeScore +=
        num(awayStanding?.wins) +
        num(homeStanding?.wins);

      if (
        awaySeed < 999 &&
        homeSeed < 999
      ) {
        hypeScore += Math.max(
          0,
          8 - Math.abs(
            awaySeed - homeSeed
          )
        );
      }

      if (
        assignedRivals &&
        previewWeek === 11
      ) {
        hypeScore += 20;
      }

      if (
        series.total > 0 &&
        Math.abs(
          series.firstWins -
          series.secondWins
        ) <= 2
      ) {
        hypeScore += 3;
      }

      const notes = [];

      if (
        assignedRivals &&
        previewWeek === 11
      ) {
        notes.push(
          "An official Rivalry Week matchup with bragging rights on the line."
        );
      }

      if (
        awayInPlayoffs &&
        homeInPlayoffs
      ) {
        notes.push(
          `Both owners currently occupy playoff positions (#${awaySeed} and #${homeSeed}).`
        );
      } else if (
        awayInPlayoffs ||
        homeInPlayoffs
      ) {
        notes.push(
          "This matchup features an owner currently inside the playoff field."
        );
      }

      if (
        awayStanding &&
        homeStanding
      ) {
        notes.push(
          `${awayName} enters ${formatRecord(
            awayStanding.wins,
            awayStanding.losses,
            awayStanding.ties
          )}, while ${homeName} is ${formatRecord(
            homeStanding.wins,
            homeStanding.losses,
            homeStanding.ties
          )}.`
        );
      }

      return {
        game,
        week: previewWeek,
        awayId,
        homeId,
        awayName,
        homeName,
        awayStanding,
        homeStanding,
        awayIntel: getTeamIntel(awayId),
        homeIntel: getTeamIntel(homeId),
        awayLive: getLiveTeam(awayId),
        homeLive: getLiveTeam(homeId),
        series,
        assignedRivals,
        hypeScore,
        analysis: notes.join(" "),
      };
    });

  const rankedMatchups = [
    ...previewMatchups,
  ].sort(
    (a, b) =>
      b.hypeScore - a.hypeScore
  );

  const gameOfTheWeek =
    rankedMatchups[0] || null;

  const otherMatchups =
    rankedMatchups.slice(1);

  // ===================================================
  // PAGE
  // ===================================================

  return (
    <main className="page-shell">
      <AutoRefresh
        enabled
        intervalMs={30000}
      />

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>
              DIRTY P FANTASY FOOTBALL
            </strong>
          </Link>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>
        </div>
      </header>

      {/* HERO */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            {currentSeason} FANTASY FOOTBALL
          </p>

          <h1>
            Dirty P Fantasy Football
          </h1>

          <p>
            Live standings, weekly matchups,
            league history, and the race
            to the championship.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {currentWeek}
          </strong>

          <span>
            CURRENT WEEK
          </span>
        </div>
      </section>

      {/* DEFENDING CHAMPION */}

      {defendingSeason?.champion && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                DEFENDING CHAMPION
              </p>

              <h2>
                {defendingSeason.champion.name}
              </h2>
            </div>

            <Link href="/champions">
              Championship History →
            </Link>
          </div>

          <div className="dp-feature-panel">
            <span>
              {defendingSeason.year}
              {" "}DIRTY P CHAMPION
            </span>

            <strong>
              {defendingSeason.champion.name}
            </strong>

            {defendingSeason.runner_up?.name && (
              <p>
                Defeated{" "}
                {defendingSeason.runner_up.name}
                {" "}in the championship game.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ESPN OWNER MAPPING WARNING */}

      {unmatchedEspnOwners.length > 0 && (
        <section className="section-block">
          <div className="dp-feature-panel">
            <strong>
              ESPN Owner Mapping Warning
            </strong>

            <p>
              Some current ESPN owners could
              not be matched to the league archive.
            </p>

            <p>
              {unmatchedEspnOwners
                .map(
                  (owner) =>
                    `${owner.ownerName} (${owner.teamName})`
                )
                .join(", ")}
            </p>
          </div>
        </section>
      )}

      {/* CURRENT STANDINGS */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {currentSeason} SEASON
            </p>

            <h2>
              Current Standings
            </h2>
          </div>

          <span>
            {standings.length} Owners
          </span>
        </div>

        <div className="dp-table-wrapper">
          <table className="dp-standings-table">
            <thead>
              <tr>
                <th>Seed</th>
                <th>Owner / Team</th>
                <th>Record</th>
                <th>PF</th>
                <th>Playoff Status</th>
              </tr>
            </thead>

            <tbody>
              {standings.map((team) => {
                const status =
                  playoffStatuses.get(
                    team.ownerId
                  ) || "Outside";

                const inField =
                  status !== "Outside";

                return (
                  <tr key={team.ownerId}>
                    <td>
                      #{team.seed || "—"}
                    </td>

                    <td>
                      <Link
                        href={`/owners/${team.ownerId}`}
                        className="dp-standing-owner"
                      >
                        <strong>
                          {team.ownerName}
                        </strong>

                        <span>
                          {team.teamName}
                        </span>
                      </Link>
                    </td>

                    <td>
                      {formatRecord(
                        team.wins,
                        team.losses,
                        team.ties
                      )}
                    </td>

                    <td>
                      {formatScore(
                        team.pointsFor
                      )}
                    </td>

                    <td>
                      <span
                        className={
                          inField
                            ? "dp-status-playoff"
                            : "dp-status-out"
                        }
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="dp-standings-note">
          Division leaders and wild cards reflect
          current ESPN playoff positions.
          They are not mathematically clinched berths.
        </p>
      </section>

      {/* AROUND THE LEAGUE
          AUTOMATICALLY UPDATES EVERY WEEK.
          HIDDEN WHEN LIVE SCORING BEGINS.
      */}

      {showAroundTheLeague && (
        <AroundTheLeague
          recap={weeklyRecap}
        />
      )}

      {/* LIVE SCOREBOARD */}

      {showLiveScoreboard && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                LIVE · WEEK {previewWeek}
              </p>

              <h2>
                Week {previewWeek} Scoreboard
              </h2>
            </div>

            <span>
              Refreshes Every 30 Seconds
            </span>
          </div>

          {rankedMatchups.length ? (
            <div className="dp-matchup-grid">
              {rankedMatchups.map(
                (matchup) => (
                  <MatchupCard
                    key={`${matchup.awayId}-${matchup.homeId}`}
                    matchup={matchup}
                    live
                  />
                )
              )}
            </div>
          ) : (
            <div className="dp-empty">
              No matchups currently available.
            </div>
          )}
        </section>
      )}

      {/* GAME OF THE WEEK — PREGAME ONLY */}

      {showPregamePreviews && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                WEEK {previewWeek} SPOTLIGHT
              </p>

              <h2>
                Game of the Week
              </h2>
            </div>

            <span>
              Featured Fantasy Matchup
            </span>
          </div>

          {gameOfTheWeek ? (
            <MatchupCard
              matchup={gameOfTheWeek}
              featured
            />
          ) : (
            <div className="dp-empty">
              Game of the Week will appear
              when the weekly schedule is available.
            </div>
          )}
        </section>
      )}

      {/* MATCHUP PREVIEWS — PREGAME ONLY */}

      {showPregamePreviews && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                WEEK {previewWeek}
              </p>

              <h2>
                Matchup Previews
              </h2>
            </div>

            <span>
              Players to Watch · Head-to-Head History
            </span>
          </div>

          {otherMatchups.length ? (
            <div className="dp-matchup-grid">
              {otherMatchups.map(
                (matchup) => (
                  <MatchupCard
                    key={`${matchup.awayId}-${matchup.homeId}`}
                    matchup={matchup}
                  />
                )
              )}
            </div>
          ) : (
            <div className="dp-empty">
              Additional matchup previews will
              appear when the schedule is available.
            </div>
          )}
        </section>
      )}

      {/* FOOTER */}

      <footer className="site-footer">
        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>

      {/* PAGE STYLES */}

      <style>{`

        .dp-feature-panel {
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
          padding:22px;
        }

        .dp-feature-panel > span {
          display:block;
          color:#e9bd67;
          font-size:11px;
          font-weight:800;
          letter-spacing:1.3px;
          margin-bottom:10px;
        }

        .dp-feature-panel > strong {
          display:block;
          color:#f5f7fa;
          font-size:23px;
          margin-bottom:8px;
        }

        .dp-feature-panel p {
          color:#aeb9c7;
          font-size:14px;
          line-height:1.6;
        }

        /* STANDINGS */

        .dp-table-wrapper {
          width:100%;
          overflow-x:auto;
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
        }

        .dp-standings-table {
          width:100%;
          border-collapse:collapse;
          min-width:560px;
        }

        .dp-standings-table th {
          text-align:left;
          color:#9aa7b8;
          font-size:11px;
          letter-spacing:.7px;
          padding:15px 14px;
          border-bottom:1px solid #303947;
        }

        .dp-standings-table td {
          padding:15px 14px;
          border-bottom:1px solid #252e39;
          color:#e6eaf0;
          font-size:13px;
        }

        .dp-standings-table tr:last-child td {
          border-bottom:none;
        }

        .dp-standing-owner {
          display:flex;
          flex-direction:column;
          gap:5px;
          color:#f3f4f6;
          text-decoration:none;
        }

        .dp-standing-owner span {
          color:#929ead;
          font-size:12px;
        }

        .dp-status-playoff {
          display:inline-block;
          color:#e9bd67;
          font-size:11px;
          font-weight:800;
          white-space:nowrap;
        }

        .dp-status-out {
          color:#8895a5;
          font-size:11px;
          font-weight:700;
        }

        .dp-standings-note {
          color:#909cab;
          font-size:12px;
          line-height:1.5;
          margin-top:12px;
        }

        /* AROUND THE LEAGUE */

        .dp-recap-intro {
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
          padding:20px 22px;
          margin-bottom:15px;
        }

        .dp-recap-intro strong {
          display:block;
          color:#f5f6f8;
          font-size:18px;
          margin-bottom:7px;
        }

        .dp-recap-intro p {
          color:#aeb9c7;
          font-size:13px;
          line-height:1.6;
          margin:0;
        }

        .dp-recap-highlights {
          display:grid;
          grid-template-columns:
            repeat(3,minmax(0,1fr));
          gap:14px;
        }

        .dp-recap-highlight {
          min-width:0;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
          padding:19px;
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .dp-recap-featured {
          border-color:#806539;
          background:
            linear-gradient(
              135deg,
              #25281f,
              #171d26 75%
            );
        }

        .dp-recap-label {
          display:block;
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:.65px;
          line-height:1.5;
        }

        .dp-recap-name {
          display:block;
          color:#f4f6f8;
          font-size:15px;
          font-weight:800;
          line-height:1.5;
          overflow-wrap:anywhere;
        }

        .dp-recap-value {
          color:#e9bd67;
          font-size:23px;
          font-weight:900;
          font-variant-numeric:tabular-nums;
          overflow-wrap:anywhere;
        }

        .dp-recap-detail {
          color:#aeb9c7;
          font-size:12px;
          line-height:1.6;
          margin:0;
        }

        .dp-recap-results {
          margin-top:22px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
          padding:20px;
        }

        .dp-recap-results-heading {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:18px;
        }

        .dp-recap-results-heading h3 {
          color:#f5f6f8;
          font-size:17px;
          margin:6px 0 0;
        }

        .dp-recap-final-count {
          color:#aeb9c7;
          font-size:11px;
          font-weight:800;
        }

        .dp-recap-results-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:12px;
        }

        .dp-recap-result {
          background:#1d2530;
          border:1px solid #303947;
          border-radius:10px;
          padding:15px;
          min-width:0;
        }

        .dp-recap-result-top {
          display:flex;
          justify-content:space-between;
          gap:8px;
          color:#91a0b1;
          font-size:10px;
          font-weight:800;
          padding-bottom:10px;
          margin-bottom:10px;
          border-bottom:1px solid #303947;
        }

        .dp-recap-result-team {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding:7px 0;
          color:#aeb9c7;
          font-size:13px;
        }

        .dp-recap-result-team a {
          color:inherit;
          text-decoration:none;
          overflow-wrap:anywhere;
        }

        .dp-recap-result-team a:hover {
          color:#e9bd67;
        }

        .dp-recap-result-team strong {
          font-size:15px;
          font-weight:800;
          font-variant-numeric:tabular-nums;
          flex-shrink:0;
        }

        .dp-recap-result-team.winner {
          color:#f4f6f8;
          font-weight:800;
        }

        .dp-recap-result-team.winner strong {
          color:#e9bd67;
        }

        /* MATCHUPS */

        .dp-matchup-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          gap:16px;
        }

        .dp-matchup-card {
          min-width:0;
          overflow:hidden;
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
        }

        .dp-featured-matchup {
          border-color:#806539;
          box-shadow:
            0 0 0 1px
            rgba(233,189,103,.1);
        }

        .dp-matchup-top {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          padding:14px 17px;
          color:#aab6c3;
          border-bottom:1px solid #303947;
          font-size:10px;
          font-weight:800;
          letter-spacing:1px;
        }

        .dp-matchup-top span:first-child {
          color:#e9bd67;
        }

        .dp-versus-row {
          display:grid;
          grid-template-columns:
            minmax(0,1fr)
            40px
            minmax(0,1fr);
          align-items:center;
          padding:25px 13px 20px;
          gap:6px;
        }

        .dp-matchup-side {
          min-width:0;
          text-align:center;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:6px;
        }

        .dp-owner-link {
          color:#f3f5f7;
          font-size:15px;
          font-weight:800;
          text-decoration:none;
          line-height:1.4;
          overflow-wrap:anywhere;
        }

        .dp-owner-link:hover {
          color:#e9bd67;
        }

        .dp-matchup-owner {
          color:#aeb9c7;
          font-size:12px;
          line-height:1.4;
        }

        .dp-matchup-record {
          color:#8896a7;
          font-size:12px;
        }

        .dp-matchup-score {
          color:#f4f6f8;
          font-size:27px;
          font-weight:900;
          margin-top:7px;
          font-variant-numeric:tabular-nums;
        }

        .dp-matchup-projection {
          font-size:11px;
          color:#d4b57d;
        }

        .dp-versus-label {
          text-align:center;
          color:#e9bd67;
          font-size:12px;
          font-weight:900;
          letter-spacing:1px;
        }

        /* PREGAME PREVIEWS */

        .dp-matchup-description {
          color:#aeb9c7;
          font-size:13px;
          line-height:1.7;
          padding:0 18px 16px;
          text-align:center;
        }

        .dp-series-line {
          border-top:1px solid #303947;
          padding:13px 18px;
          text-align:center;
          color:#d6b77c;
          font-size:12px;
          font-weight:700;
        }

        .dp-players-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          border-top:1px solid #303947;
        }

        .dp-players-panel {
          padding:15px;
          min-width:0;
        }

        .dp-players-panel +
        .dp-players-panel {
          border-left:1px solid #303947;
        }

        .dp-players-heading {
          font-size:10px;
          letter-spacing:.7px;
          color:#e9bd67;
          font-weight:800;
          margin-bottom:12px;
        }

        .dp-player-row {
          display:flex;
          flex-direction:column;
          gap:4px;
          padding:9px 0;
          border-bottom:1px solid #29313d;
        }

        .dp-player-row:last-child {
          border-bottom:none;
        }

        .dp-player-row strong {
          color:#f0f2f5;
          font-size:12px;
        }

        .dp-player-row span {
          color:#9ba8b7;
          font-size:11px;
          line-height:1.5;
        }

        /* LIVE STARTING LINEUPS */

        .dp-live-lineups-grid {
          display:grid;
          grid-template-columns:
            repeat(2,minmax(0,1fr));
          border-top:1px solid #303947;
        }

        .dp-live-lineup {
          min-width:0;
          padding:15px;
        }

        .dp-live-lineup +
        .dp-live-lineup {
          border-left:1px solid #303947;
        }

        .dp-live-lineup-heading {
          display:flex;
          flex-direction:column;
          gap:3px;
          color:#e9bd67;
          font-size:13px;
          font-weight:800;
          margin-bottom:13px;
        }

        .dp-live-lineup-heading span {
          color:#8998a9;
          font-size:9px;
          letter-spacing:.8px;
        }

        .dp-live-players {
          display:flex;
          flex-direction:column;
        }

        .dp-live-player {
          display:grid;
          grid-template-columns:
            37px minmax(0,1fr) 55px;
          gap:8px;
          align-items:center;
          padding:10px 0;
          border-bottom:1px solid #29313d;
        }

        .dp-live-player:last-child {
          border-bottom:none;
        }

        .dp-live-player-slot {
          color:#e9bd67;
          font-size:10px;
          font-weight:900;
          text-align:center;
        }

        .dp-live-player-info {
          display:flex;
          flex-direction:column;
          gap:4px;
          min-width:0;
        }

        .dp-live-player-info strong {
          color:#f3f5f7;
          font-size:12px;
          overflow-wrap:anywhere;
        }

        .dp-live-player-info span {
          color:#8f9cac;
          font-size:10px;
        }

        .dp-live-player-score {
          color:#f5f6f8;
          font-size:13px;
          font-weight:900;
          font-variant-numeric:tabular-nums;
          text-align:right;
        }

        .dp-lineup-unavailable {
          color:#8f9cac;
          font-size:11px;
          line-height:1.6;
          margin:8px 0;
        }

        .dp-empty {
          background:#171d26;
          border:1px solid #303947;
          border-radius:14px;
          color:#9ba8b7;
          text-align:center;
          padding:30px;
          font-size:14px;
        }

        /* RESPONSIVE */

        @media(max-width:1000px) {
          .dp-recap-highlights {
            grid-template-columns:
              repeat(2,minmax(0,1fr));
          }
        }

        @media(max-width:850px) {
          .dp-matchup-grid {
            grid-template-columns:1fr;
          }
        }

        @media(max-width:650px) {
          .dp-recap-results-grid {
            grid-template-columns:1fr;
          }
        }

        @media(max-width:480px) {
          .dp-recap-highlights {
            grid-template-columns:1fr;
          }

          .dp-recap-highlight {
            padding:16px;
          }

          .dp-recap-value {
            font-size:20px;
          }

          .dp-recap-results {
            padding:14px;
          }

          .dp-versus-row {
            grid-template-columns:
              minmax(0,1fr)
              28px
              minmax(0,1fr);
            padding:20px 9px;
          }

          .dp-owner-link {
            font-size:13px;
          }

          .dp-matchup-score {
            font-size:23px;
          }

          .dp-players-panel {
            padding:11px;
          }

          .dp-live-lineup {
            padding:10px;
          }

          .dp-live-player {
            grid-template-columns:
              30px minmax(0,1fr) 44px;
            gap:5px;
          }

          .dp-live-player-info strong {
            font-size:11px;
          }

          .dp-live-player-score {
            font-size:12px;
          }
        }

      `}</style>
    </main>
  );
}
