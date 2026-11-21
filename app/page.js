
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";
import { getMatchupIntel } from "../lib/matchupIntel";
import { getEspnLiveScoreMap, NFL_TEAMS } from "../lib/espnLiveScore";
import { canonicalNflTeam, getNflGameMap } from "../lib/nflGameScores";
import { getNflPlayerBoxScores } from "../lib/nflPlayerBoxScores";
import AutoRefresh from "./components/AutoRefresh";
import MatchupLineupSwitcher from "./components/MatchupLineupSwitcher";
import { buildRecordWatches, buildPlayoffPulse } from "../lib/liveFeatures";
import { buildWeekHistory } from "../lib/weekHistory";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;
const PLAYOFF_TEAMS = 4;

const RIVALS = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

// =====================================================
// HELPERS
// =====================================================

function valueOrNull(value) {
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

function n(value) {
  return valueOrNull(value) ?? 0;
}

function points(value) {
  const result = valueOrNull(value);
  return result === null ? "—" : result.toFixed(2);
}

function one(value) {
  const result = valueOrNull(value);
  return result === null ? "—" : result.toFixed(1);
}

function record(team) {
  if (!team) return "—";

  const base = `${n(team.wins)}-${n(team.losses)}`;

  return n(team.ties)
    ? `${base}-${n(team.ties)}`
    : base;
}

function first(name) {
  return (
    String(name || "").trim().split(" ")[0] ||
    "Owner"
  );
}

function isRival(a, b) {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();

  return RIVALS.some(([one, two]) => {
    const p = one.toLowerCase();
    const q = two.toLowerCase();

    return (
      (x === p && y === q) ||
      (x === q && y === p)
    );
  });
}

// Give each designated rivalry its own matchup storyline.
function rivalryStory(a, b, series, awayStanding, homeStanding) {
  const names = [a, b].map(name => String(name || "").toLowerCase());
  const includes = (name) => names.includes(name.toLowerCase());
  const gamesPlayed = n(series.aWins) + n(series.bWins) + n(series.ties);
  const margin = Math.abs(n(series.aWins) - n(series.bWins));
  const history = gamesPlayed === 0
    ? "This matchup is writing the first chapter of its head-to-head history."
    : margin === 0
      ? `Their all-time series is tied after ${gamesPlayed} meetings, so this one breaks the deadlock.`
      : margin === 1
        ? "The all-time series is separated by just one game, adding another chapter to a tight rivalry."
        : "The trailing owner has a chance to cut into the all-time series gap.";

  if (includes("Reed Bushkuhl") && includes("Austin Lloyd")) {
    return `Reed and Austin have their own score to settle in Rivalry Week. ${history}`;
  }
  if (includes("Ryan Goodlett") && includes("Matthew Aitkens")) {
    return `Ryan and Matthew get another head-to-head showdown with plenty to talk about afterward. ${history}`;
  }
  if (includes("Tyler Guenther") && includes("Edward Wachtel")) {
    return `Tyler and Edward meet with the historical bragging rights up for grabs again. ${history}`;
  }
  if (includes("Brent Fleischer") && includes("Valentin Almendarez")) {
    return `Brent and Valentin renew their Rivalry Week matchup, with a chance to rewrite the head-to-head story. ${history}`;
  }
  if (includes("Jacob Madden") && includes("Cody Stinnett")) {
    return `Cody and Jacob square off in a matchup where the all-time results are part of the stakes. ${history}`;
  }
  return `A rivalry with its own history takes center stage this week. ${history}`;
}

function isFinal(game) {
  const winner = String(
    game?.winner || ""
  ).toUpperCase();

  return (
    game?.completed === true ||
    game?.is_final === true ||
    String(
      game?.status || ""
    ).toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(winner)
  );
}

function pairKey(game) {
  const a = n(game.home_owner_id);
  const b = n(game.away_owner_id);

  return (
    `${Math.min(a, b)}-${Math.max(a, b)}`
  );
}

function getWinner(game) {
  const winner = String(
    game?.winner || ""
  ).toUpperCase();

  if (winner === "HOME") {
    return n(game.home_owner_id);
  }

  if (winner === "AWAY") {
    return n(game.away_owner_id);
  }

  if (winner === "TIE") {
    return null;
  }

  if (!isFinal(game)) {
    return null;
  }

  const home = valueOrNull(game.home_score);
  const away = valueOrNull(game.away_score);

  if (home === null || away === null) {
    return null;
  }

  if (home > away) {
    return n(game.home_owner_id);
  }

  if (away > home) {
    return n(game.away_owner_id);
  }

  return null;
}

function headToHead(games, a, b) {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  for (const game of games) {
    const home = n(game.home_owner_id);
    const away = n(game.away_owner_id);

    const matching =
      (home === a && away === b) ||
      (home === b && away === a);

    if (!matching || !isFinal(game)) {
      continue;
    }

    if (
      String(game.winner).toUpperCase() ===
      "TIE"
    ) {
      ties++;
      continue;
    }

    const winner = getWinner(game);

    if (winner === a) aWins++;
    if (winner === b) bWins++;
  }

  return { aWins, bWins, ties };
}

function seriesText(series, a, b) {
  const { aWins, bWins, ties } = series;

  if (!aWins && !bWins && !ties) {
    return "No previous completed meetings";
  }

  if (aWins > bWins) {
    return (
      `${a} leads the all-time series ` +
      `${aWins}-${bWins}`
    );
  }

  if (bWins > aWins) {
    return (
      `${b} leads the all-time series ` +
      `${bWins}-${aWins}`
    );
  }

  return (
    `All-time series tied ${aWins}-${bWins}`
  );
}

// =====================================================
// STANDINGS
// =====================================================

function buildStandings(teams, results, owners) {
  const ownerNames = new Map(
    owners.map(owner => [
      n(owner.id),
      owner.name
    ])
  );

  const resultsByOwner = new Map(
    results.map(result => [
      n(result.owner_id),
      result
    ])
  );

  return teams
    .map(team => {
      const ownerId = n(
        team.owner_id ?? team.ownerId
      );

      const result =
        resultsByOwner.get(ownerId);

      return {
        ownerId,

        ownerName:
          ownerNames.get(ownerId) ||
          team.ownerName ||
          "Unknown Owner",

        teamName:
          team.team_name ||
          team.teamName ||
          "Unknown Team",

        espnTeamId: n(
          team.espnTeamId ??
          team.espn_team_id ??
          team.id
        ),

        seed: n(
          team.playoffSeed ??
          team.playoff_seed ??
          team.seed
        ),

        divisionId:
          team.division_id ??
          team.divisionId ??
          null,

        divisionName:
          team.division_name ??
          team.divisionName ??
          null,

        wins: n(
          team.wins ??
          result?.wins
        ),

        losses: n(
          team.losses ??
          result?.losses
        ),

        ties: n(
          team.ties ??
          result?.ties
        ),

        pointsFor: n(
          team.pointsFor ??
          team.points_for ??
          result?.points_for
        ),

        pointsAgainst: n(
          team.pointsAgainst ??
          team.points_against ??
          result?.points_against
        )
      };
    })
    .filter(team => team.ownerId > 0)
    .sort((a, b) => {
      const aSeed = a.seed || 999;
      const bSeed = b.seed || 999;

      return (
        aSeed - bSeed ||
        b.wins - a.wins ||
        b.pointsFor - a.pointsFor
      );
    });
}

// Prefer ESPN seeding when available.
// Otherwise use record and points scored.

function standingsRank(a, b) {
  const aSeed =
    a.seed > 0 ? a.seed : 999;

  const bSeed =
    b.seed > 0 ? b.seed : 999;

  const aPlayed =
    a.wins + a.losses + a.ties;

  const bPlayed =
    b.wins + b.losses + b.ties;

  const aPct = aPlayed
    ? (a.wins + a.ties / 2) / aPlayed
    : 0;

  const bPct = bPlayed
    ? (b.wins + b.ties / 2) / bPlayed
    : 0;

  return (
    aSeed - bSeed ||
    bPct - aPct ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.ownerName.localeCompare(b.ownerName)
  );
}

// =====================================================
// TWO-DIVISION PLAYOFF STANDINGS
// =====================================================

function buildDivisionStandings(
  standings,
  playoffCount
) {
  const groups = new Map();

  for (const team of standings) {
    const key =
      team.divisionId === null ||
      team.divisionId === undefined ||
      team.divisionId === ""
        ? "unassigned"
        : String(team.divisionId);

    if (!groups.has(key)) {
      groups.set(key, {
        id: key,

        name:
          team.divisionName ||
          (
            key === "unassigned"
              ? "Unassigned Division"
              : `Division ${key}`
          ),

        teams: []
      });
    }

    groups.get(key).teams.push(team);
  }

  const divisions = [
    ...groups.values()
  ]
    .map(group => ({
      ...group,
      teams: [...group.teams]
        .sort(standingsRank)
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    );

  const hasTwoDivisions =
    divisions.length === 2 &&
    !groups.has("unassigned");

  const statusMap = new Map(
    standings.map(team => [
      team.ownerId,
      "Outside"
    ])
  );

  if (hasTwoDivisions) {
    // Each division leader receives
    // an automatic playoff position.

    const leaders = divisions.map(
      group => group.teams[0]
    );

    const leaderIds = new Set(
      leaders.map(team => team.ownerId)
    );

    for (const leader of leaders) {
      statusMap.set(
        leader.ownerId,
        "Division Leader"
      );
    }

    // Remaining playoff spots go to
    // the highest-ranked non-leaders.

    const wildCards = standings
      .filter(
        team =>
          !leaderIds.has(team.ownerId)
      )
      .sort(standingsRank)
      .slice(
        0,
        Math.max(
          0,
          playoffCount - leaders.length
        )
      );

    for (const team of wildCards) {
      statusMap.set(
        team.ownerId,
        "Wild Card"
      );
    }
  } else {
    // Fallback when there are not
    // exactly two divisions.

    const playoffTeams = [
      ...standings
    ]
      .sort(standingsRank)
      .slice(0, playoffCount);

    for (const team of playoffTeams) {
      statusMap.set(
        team.ownerId,
        "Playoff Position"
      );
    }
  }

  return {
    divisions,
    statusMap,
    hasTwoDivisions
  };
}

// =====================================================
// WEEKLY RECAP
// =====================================================

function buildRecap(
  games,
  week,
  ownerMap
) {
  const unique = new Map();

  for (const game of games) {
    if (
      n(game.matchup_period) !== week ||
      !isFinal(game) ||
      valueOrNull(game.home_score) === null ||
      valueOrNull(game.away_score) === null
    ) {
      continue;
    }

    unique.set(
      pairKey(game),
      game
    );
  }

  if (!unique.size) {
    return null;
  }

  const results = [
    ...unique.values()
  ].map(game => {
    const awayId =
      n(game.away_owner_id);

    const homeId =
      n(game.home_owner_id);

    const awayScore =
      n(game.away_score);

    const homeScore =
      n(game.home_score);

    return {
      id: pairKey(game),
      awayId,
      homeId,

      awayName:
        ownerMap.get(awayId) ||
        "Away",

      homeName:
        ownerMap.get(homeId) ||
        "Home",

      awayScore,
      homeScore,

      margin:
        Math.abs(
          awayScore - homeScore
        ),

      total:
        awayScore + homeScore,

      winnerId: getWinner(game)
    };
  });

  const performances =
    results.flatMap(game => [
      {
        ownerId: game.awayId,
        name: game.awayName,
        score: game.awayScore
      },
      {
        ownerId: game.homeId,
        name: game.homeName,
        score: game.homeScore
      }
    ]);

  const decisive = results.filter(
    game =>
      game.awayScore !==
      game.homeScore
  );

  const blowout = [
    ...decisive
  ].sort(
    (a, b) =>
      b.margin - a.margin
  )[0] || null;

  const closest = [
    ...results
  ].sort(
    (a, b) =>
      a.margin - b.margin
  )[0];

  const shootout = [
    ...results
  ].sort(
    (a, b) =>
      b.total - a.total
  )[0];

  const totalPoints =
    performances.reduce(
      (sum, item) =>
        sum + item.score,
      0
    );

  const average =
    performances.length
      ? totalPoints /
        performances.length
      : 0;

  return {
    week,
    results,
    blowout,
    closest,
    shootout,
    average,
    totalPoints
  };
}

function RecapStat({
  label,
  name,
  value,
  detail
}) {
  return (
    <div className="dp-recap-stat">
      <span>{label}</span>

      <strong>{name}</strong>

      <b>{value}</b>

      {detail && (
        <small>{detail}</small>
      )}
    </div>
  );
}

function buildWeeklyImpact(standings, completedByWeek, week, playoffCount) {
  if (!week || week < 2 || standings.length <= playoffCount) return null;

  const teams = new Map(standings.map(team => [
    team.ownerId,
    { ...team, seed: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0 },
  ]));

  function addGame(game) {
    const home = teams.get(n(game.home_owner_id));
    const away = teams.get(n(game.away_owner_id));
    if (!home || !away) return;
    const winner = getWinner(game);

    for (const [team, score] of [[home, game.home_score], [away, game.away_score]]) {
      team.pointsFor += n(score);
      if (winner === team.ownerId) team.wins += 1;
      else if (winner) team.losses += 1;
      else team.ties += 1;
    }
  }

  function snapshot() {
    const table = [...teams.values()];
    const { statusMap } = buildDivisionStandings(table, playoffCount);
    const tier = { "Division Leader": 0, "Wild Card": 1, "Playoff Position": 1, Outside: 2 };
    const sorted = table.sort((a, b) =>
      tier[statusMap.get(a.ownerId)] - tier[statusMap.get(b.ownerId)] || standingsRank(a, b)
    );
    return new Map(sorted.map((team, index) => [
      team.ownerId,
      { seed: index + 1, inPlayoffs: statusMap.get(team.ownerId) !== "Outside", wins: team.wins, losses: team.losses, ties: team.ties },
    ]));
  }

  for (const [gameWeek, games] of completedByWeek) {
    if (gameWeek >= week) continue;
    for (const game of games.values()) {
      if (!game.is_playoff && !game.is_consolation) addGame(game);
    }
  }

  const before = snapshot();
  const games = [...(completedByWeek.get(week)?.values() ?? [])]
    .filter(game => !game.is_playoff && !game.is_consolation);
  games.forEach(addGame);
  const after = snapshot();

  const gains = [];
  const slides = [];

  for (const game of games) {
    const winnerId = getWinner(game);
    if (!winnerId) continue;
    const homeId = n(game.home_owner_id);
    const awayId = n(game.away_owner_id);
    const loserId = winnerId === homeId ? awayId : homeId;

    for (const [id, opponentId, direction, candidates] of [
      [winnerId, loserId, 1, gains],
      [loserId, winnerId, -1, slides],
    ]) {
      const team = teams.get(id);
      const opponent = teams.get(opponentId);
      const previous = before.get(id);
      const current = after.get(id);
      if (!team || !opponent || !previous || !current) continue;
      const spots = direction * (previous.seed - current.seed);
      const crossed = direction * (Number(current.inPlayoffs) - Number(previous.inPlayoffs)) > 0;
      if (spots <= 0 && !crossed) continue;
      candidates.push({ team, opponent, previous, current, crossed, spots });
    }
  }

  const rank = (a, b) => Number(b.crossed) - Number(a.crossed) || b.spots - a.spots;
  const leaders = candidates => {
    const sorted = candidates.sort(rank);
    return sorted.filter(candidate => rank(candidate, sorted[0]) === 0);
  };

  return { week, gains: leaders(gains), slides: leaders(slides) };
}

function WeeklyImpact({ impact }) {
  if (!impact) return null;

  const awards = [
    { label: "Who Won the Week?", entries: impact.gains, gained: true },
    { label: "Who Fumbled the Bag?", entries: impact.slides, gained: false },
  ];

  return (
    <section className="dp-week-results" aria-labelledby="dp-week-results-title">
      <h2 id="dp-week-results-title">Week {impact.week} Impact</h2>
      <div className="dp-week-results-grid">
        {awards.map(({ label, entries, gained }) => (
          <article className={`dp-week-award${gained ? "" : " dp-week-award-low"}`} key={label}>
            <h3>{label}</h3>
            {entries.length ? entries.map(({ team, opponent, previous, current, crossed }) => (
              <div className="dp-week-impact-owner" key={team.ownerId}>
                <p>{team.ownerName}</p>
                <strong>#{previous.seed} → #{current.seed}</strong>
                <span>
                  {gained ? "Beat" : "Lost to"} {first(opponent.ownerName)}
                  {crossed && (gained ? " and moved into a playoff spot." : " and fell out of a playoff spot.")}
                </span>
              </div>
            )) : (
              <span>{gained ? "No winner moved up in playoff seeding." : "No losing team dropped in playoff seeding."}</span>
            )}
          </article>
        ))}
      </div>
      <p className="dp-week-impact-note">Estimated seeds before and after the week using record, points scored, and division leaders. Moving across the playoff cutoff counts first.</p>
    </section>
  );
}

function AroundTheLeague({ recap }) {
  if (!recap) return null;

  const {
    week,
    results,
    blowout,
    closest,
    shootout,
    average,
    totalPoints
  } = recap;

  function winnerName(game) {
    if (!game) return "—";

    if (
      game.winnerId === game.awayId
    ) {
      return game.awayName;
    }

    if (
      game.winnerId === game.homeId
    ) {
      return game.homeName;
    }

    return "Tie";
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            WEEK {week} RECAP
          </p>

          <h2>Around the League</h2>
        </div>

        <span>
          {results.length} Final Matchups
        </span>
      </div>

      <p className="dp-recap-description">
        The biggest performances,
        closest finishes, and standout
        results from Week {week}.
      </p>

      <div className="dp-recap-grid">

        {blowout && (
          <RecapStat
            label="💥 BIGGEST BLOWOUT"
            name={winnerName(blowout)}
            value={
              `${points(
                blowout.margin
              )} PTS`
            }
            detail="Largest winning margin"
          />
        )}

        {closest && (
          <RecapStat
            label="🔥 CLOSEST GAME"
            name={
              `${first(
                closest.awayName
              )} vs ${first(
                closest.homeName
              )}`
            }
            value={
              `${points(
                closest.margin
              )} PTS`
            }
            detail={
              `${points(
                closest.awayScore
              )} – ${points(
                closest.homeScore
              )}`
            }
          />
        )}

        {shootout && (
          <RecapStat
            label="🚀 HIGHEST-SCORING MATCHUP"
            name={
              `${first(
                shootout.awayName
              )} vs ${first(
                shootout.homeName
              )}`
            }
            value={
              `${points(
                shootout.total
              )} PTS`
            }
            detail="Combined team points"
          />
        )}

        <RecapStat
          label="📊 LEAGUE AVERAGE"
          name="Weekly Team Average"
          value={
            `${points(average)} PTS`
          }
          detail={
            `${points(
              totalPoints
            )} total league points`
          }
        />

      </div>

      <div className="dp-recap-results">
        <h3>
          Week {week} Results
        </h3>

        <div className="dp-recap-results-grid">
          {results.map(game => (
            <div
              className="dp-recap-result"
              key={game.id}
            >
              <span className="dp-recap-final">
                FINAL
              </span>

              <div
                className={
                  "dp-recap-result-team " +
                  (
                    game.winnerId === game.awayId
                      ? "winner"
                      : ""
                  )
                }
              >
                <Link
                  href={
                    `/owners/${game.awayId}`
                  }
                >
                  {game.awayName}
                </Link>

                <strong>
                  {points(game.awayScore)}
                </strong>
              </div>

              <div
                className={
                  "dp-recap-result-team " +
                  (
                    game.winnerId === game.homeId
                      ? "winner"
                      : ""
                  )
                }
              >
                <Link
                  href={
                    `/owners/${game.homeId}`
                  }
                >
                  {game.homeName}
                </Link>

                <strong>
                  {points(game.homeScore)}
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =====================================================
// PREGAME / LIVE PLAYERS
// =====================================================

const BENCH_SLOTS = new Set([
  "BE",
  "BN",
  "BENCH",
  "IR",
  "20",
  "21"
]);

const SLOT_NAMES = {
  0: "QB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  16: "D/ST",
  17: "K",
  20: "BE",
  21: "IR",
  23: "FLEX"
};

function lineupSlot(entry) {
  const value =
    entry?.lineupSlot ??
    entry?.lineupSlotId ??
    entry?.lineup_slot_id ??
    entry?.slot ??
    null;

  if (value === null) {
    return null;
  }

  return (
    SLOT_NAMES[value] ||
    String(value).toUpperCase()
  );
}

const ESPN_LINEUP_ORDER = {
  TQB: 0, QB: 1, RB: 2, "RB/WR": 3, WR: 4, "WR/TE": 5,
  TE: 6, OP: 7, FLEX: 8, "D/ST": 9, K: 10, P: 11,
  BE: 12, BN: 12, IR: 13
};

function liveStarters(team) {
  const entries = team?.startingLineup ?? team?.starters ?? [];
  return Array.isArray(entries)
    ? entries.filter(entry => entry?.isStarter !== false)
        .sort((a, b) => (ESPN_LINEUP_ORDER[a.slot] ?? 50) - (ESPN_LINEUP_ORDER[b.slot] ?? 50))
    : [];
}

function liveBench(team) {
  const entries = team?.bench ?? [];
  return Array.isArray(entries) ? entries : [];
}

function PregamePlayers({
  title,
  players
}) {
  return (
    <div className="dp-players-panel">
      <div className="dp-players-heading">
        {title}
      </div>

      {players.length ? (
        players.map((player, index) => (
          <div
            className="dp-player-row"
            key={
              player.playerId ||
              index
            }
          >
            <strong>
              {player.name}
            </strong>

            <span>
              {player.position || "Player"}

              {valueOrNull(
                player.projection
              ) !== null
                ? ` · ${one(
                    player.projection
                  )} projected`
                : ""}

              {player.opponent
                ? ` · vs ${player.opponent}`
                : ""}
            </span>
          </div>
        ))
      ) : (
        <p className="dp-muted">
          Player projections unavailable.
        </p>
      )}
    </div>
  );
}

function NflTeamLogo({ code, size = 22, decorative = false, loading = "lazy" }) {
  const normalized = ({ WSH: "was", JAC: "jax", LA: "lar", OAK: "lv", SD: "lac", STL: "lar" })[String(code || "").toUpperCase()] || String(code || "").toLowerCase();
  if (!normalized) return null;
  return <img
    src={`https://a.espncdn.com/i/teamlogos/nfl/500/${normalized}.png`}
    alt={decorative ? "" : `${code} logo`}
    width={size}
    height={size}
    loading={loading}
    className="dp-nfl-logo"
  />;
}

const nflRibbonTeams = Object.values(NFL_TEAMS).sort();

function NflLogoRibbon() {
  return (
    <div className="dp-nfl-ribbon">
      <input type="checkbox" id="dp-pause-nfl-ribbon" className="dp-nfl-ribbon-toggle" />
      <label htmlFor="dp-pause-nfl-ribbon" className="dp-nfl-ribbon-control">
        <span className="dp-nfl-ribbon-control-label">Pause NFL logo ribbon</span>
        <span className="dp-nfl-ribbon-pause" aria-hidden="true">Ⅱ</span>
        <span className="dp-nfl-ribbon-play" aria-hidden="true">▶</span>
      </label>
      <div className="dp-nfl-ribbon-window">
        <div className="dp-nfl-ribbon-track" aria-hidden="true">
          {[0, 1].map(copy => (
            <div className="dp-nfl-ribbon-group" key={copy}>
              {nflRibbonTeams.map(code => (
                <NflTeamLogo key={code} code={code} size={40} decorative loading="eager" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EspnLineupRows({ players, nflGames = {}, playerBoxScores = {} }) {
  return players.map((player, index) => {
    const actual = valueOrNull(player.currentPoints ?? player.actualPoints);
    const projected = valueOrNull(player.projectedPoints);
    const nflGame = nflGames[canonicalNflTeam(player.nflTeam)] || null;
    const started = nflGame?.state === "in" || nflGame?.state === "post";
    const gameStats = started ? playerBoxScores[String(player.playerId || player.id || "")] : null;
    return (
      <div className="dp-espn-player" key={player.id || index}>
        <span className="dp-espn-slot">{player.slot || "—"}</span>
        <span className="dp-espn-player-info">
          <span className="dp-player-identity">
            <span className="dp-nfl-logo-badge"><NflTeamLogo code={player.nflTeam} size={38} /></span>
            <strong>{player.name || player.fullName}</strong>
          </span>
          <small>{[player.nflTeam, player.position].filter(Boolean).join(" · ") || "NFL Player"}</small>
          {nflGame && (
            <>
              <small className="dp-espn-nfl-game">
                {nflGame.isHome ? "vs " : "@ "}{nflGame.opponent}
                {nflGame.state === "pre" && (
                  <>
                    {" · "}
                    {nflGame.kickoff ? new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Chicago", weekday: "short", month: "short",
                      day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
                    }).format(new Date(nflGame.kickoff)) : nflGame.status}
                  </>
                )}
              </small>
              {nflGame.state === "in" && (
                <small className="dp-espn-nfl-game">
                  {nflGame.ownScore ?? "–"}-{nflGame.opponentScore ?? "–"} · {nflGame.status}
                </small>
              )}
              {nflGame.state === "post" && (
                <small className="dp-espn-nfl-game">FINAL · {nflGame.ownScore ?? "–"}-{nflGame.opponentScore ?? "–"}</small>
              )}
            </>
          )}
        </span>
        <span className={"dp-espn-stat-focus" + (started ? " dp-espn-stat-active" : "")}>
          {started ? (gameStats || "Stats pending") : null}
        </span>
        {started ? (
          <b className="dp-espn-number dp-espn-actual">{actual === null ? "—" : points(actual)}</b>
        ) : (
          <span className="dp-espn-number dp-espn-projection" title="Projected fantasy points">
            {projected === null ? "—" : one(projected)}
            <small>PROJ</small>
          </span>
        )}
      </div>
    );
  });
}

function LiveLineup({ name, team, nflGames = {}, playerBoxScores = {} }) {
  const starters = liveStarters(team);
  const bench = liveBench(team);
  return (
    <div className="dp-live-lineup dp-espn-lineup">
      <div className="dp-espn-team-title">{name} · LINEUP</div>
      <div className="dp-espn-columns">
        <span>POS</span><span>PLAYER</span><span>STATS</span><span>PTS / PROJ</span>
      </div>
      {starters.length ? <EspnLineupRows players={starters} nflGames={nflGames} playerBoxScores={playerBoxScores} /> : (
        <p className="dp-muted">ESPN lineup data is not available yet.</p>
      )}
      {bench.length > 0 && (
        <details className="dp-espn-bench">
          <summary>Bench ({bench.length}) <span>⌄</span></summary>
          <EspnLineupRows players={bench} nflGames={nflGames} playerBoxScores={playerBoxScores} />
        </details>
      )}

    </div>
  );
}

// =====================================================
// MATCHUP CARD
// =====================================================

function MatchupCard({
  matchup,
  live = false,
  featured = false,
  nflGames = {},
  playerBoxScores = {}
}) {
  const sides = [
    {
      ownerId: matchup.awayId,
      name: matchup.awayName,
      standing: matchup.awayStanding,
      intel: matchup.awayIntel,
      liveTeam: matchup.awayLive,

      score:
        matchup.awayLive?.currentPoints ??
        (
          live
            ? matchup.game.away_score
            : null
        )
    },
    {
      ownerId: matchup.homeId,
      name: matchup.homeName,
      standing: matchup.homeStanding,
      intel: matchup.homeIntel,
      liveTeam: matchup.homeLive,

      score:
        matchup.homeLive?.currentPoints ??
        (
          live
            ? matchup.game.home_score
            : null
        )
    }
  ];

  const matchupHeader = (
    <>
      <div className="dp-matchup-top">
        <span>
          {matchup.rival &&
          matchup.week === 11
            ? "RIVALRY WEEK"
            : featured
            ? "FEATURED MATCHUP"
            : `WEEK ${matchup.week}`}
        </span>

        <span>
          {live
            ? isFinal(matchup.game)
              ? "FINAL"
              : "LIVE SCORES"
            : "MATCHUP PREVIEW"}
        </span>
      </div>
      {live && matchup.playoffImplications && (
        <div className="dp-playoff-implications-label">
          <span aria-hidden="true">◆</span> PLAYOFF IMPLICATIONS
          <small>Current playoff race</small>
        </div>
      )}

      <div className="dp-matchup-versus">
        {sides.map((side, index) => (
          <div
            className="dp-matchup-versus-item"
            key={side.ownerId}
          >
            {index === 1 && (
              <span className="dp-vs">
                VS
              </span>
            )}

            <div className="dp-matchup-team">
              {live ? (
                <span className="dp-matchup-team-label">
                  {side.standing?.teamName || side.name}
                </span>
              ) : (
                <Link href={`/owners/${side.ownerId}`}>
                  {side.standing?.teamName || side.name}
                </Link>
              )}

              <small>
                {side.name}
              </small>

              <small className="dp-matchup-record">
                {record(side.standing)}
              </small>

              <div className="dp-team-live-totals">
                {valueOrNull(side.score) !== null && (
                  <strong>{points(side.score)}</strong>
                )}
                {live && valueOrNull(side.liveTeam?.liveProjectedPoints ?? side.intel?.projectedPoints) !== null && (
                  <small className="dp-team-projected">
                    Projected {one(side.liveTeam?.liveProjectedPoints ?? side.intel?.projectedPoints)}
                  </small>
                )}
              </div>

              {!live &&
                valueOrNull(
                  side.intel?.projectedPoints
                ) !== null && (
                  <small className="dp-gold">
                    Projected:{" "}
                    {one(
                      side.intel.projectedPoints
                    )}
                  </small>
                )}
            </div>
          </div>
        ))}
      </div>

    </>
  );

  return (
    <article
      className={
        "dp-matchup-card " +
        (featured ? "dp-featured-matchup" : "") +
        (live && matchup.playoffImplications ? " dp-playoff-implications" : "")
      }
    >
      {live ? (
        <details className="dp-live-matchup-details">
          <summary className="dp-live-matchup-summary">
            {matchupHeader}
            <div className="dp-matchup-expand-row">
              <span>Player lineups &amp; game stats</span>
              <span className="dp-matchup-expand-action">
                <span className="dp-matchup-expand-text">View lineup</span>
                <span className="dp-matchup-expand-chevron" aria-hidden="true">⌄</span>
              </span>
            </div>
          </summary>
          <MatchupLineupSwitcher awayName={first(sides[0].name)} homeName={first(sides[1].name)}>
            {sides.map(side => (
              <LiveLineup
                key={side.ownerId}
                name={first(side.name)}
                team={side.liveTeam}
                nflGames={nflGames}
                playerBoxScores={playerBoxScores}
              />
            ))}
          </MatchupLineupSwitcher>
        </details>
      ) : (
        <>
          {matchupHeader}

          <p className="dp-matchup-analysis">
            {matchup.analysis}
          </p>

          <p className="dp-matchup-series">
            {matchup.series}
          </p>

          <div className="dp-two-columns">
            {sides.map(side => (
              <PregamePlayers
                key={side.ownerId}
                title={
                  `${first(
                    side.name
                  )} · PLAYERS TO WATCH`
                }
                players={
                  side.intel
                    ?.impactPlayers
                    ?.slice(
                      0,
                      featured ? 3 : 2
                    ) || []
                }
              />
            ))}
          </div>
        </>
      )}
    </article>
  );
}

// =====================================================
// HOMEPAGE
// =====================================================

export default async function Home() {
  let league;

  try {
    league =
      await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>
          Dirty P Fantasy Football
        </h1>

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
    unmatchedEspnOwners = []
  } = league;

  const season =
    n(currentSeason);

  const week =
    n(currentWeek);

  const ownerMap = new Map(
    owners.map(owner => [
      n(owner.id),
      owner.name
    ])
  );

  const standings = buildStandings(
    currentTeams,
    currentSeasonResults,
    owners
  );

  const standingsByOwner = new Map(
    standings.map(team => [
      team.ownerId,
      team
    ])
  );

  // Both divisions and current
  // playoff positions.

  const {
    divisions: divisionStandings,
    statusMap,
    hasTwoDivisions
  } = buildDivisionStandings(
    standings,
    n(playoffTeamCount) ||
      PLAYOFF_TEAMS
  );

  // ==================================================
  // COMPLETED WEEKLY MATCHUPS
  // ==================================================

  const completedGames = [
    ...completedCurrentMatchups,
    ...currentSeasonMatchups.filter(
      isFinal
    )
  ];

  const completedByWeek =
    new Map();

  for (const game of completedGames) {
    const gameWeek =
      n(game.matchup_period);

    if (
      gameWeek < 1 ||
      !isFinal(game) ||
      valueOrNull(
        game.home_score
      ) === null ||
      valueOrNull(
        game.away_score
      ) === null
    ) {
      continue;
    }

    if (
      !completedByWeek.has(gameWeek)
    ) {
      completedByWeek.set(
        gameWeek,
        new Map()
      );
    }

    completedByWeek
      .get(gameWeek)
      .set(
        pairKey(game),
        game
      );
  }

  const regularGames =
    currentSeasonMatchups.filter(
      game =>
        game.is_playoff !== true &&
        game.is_consolation !== true
    );

  const availableWeeks = [
    ...new Set(
      regularGames
        .map(game =>
          n(game.matchup_period)
        )
        .filter(item =>
          item > 0
        )
    )
  ].sort(
    (a, b) => a - b
  );

  const displayWeek =
    availableWeeks.includes(week)
      ? week
      : availableWeeks.find(
          item => item >= week
        ) ||
        availableWeeks[
          availableWeeks.length - 1
        ] ||
        week;

  const weeklyGames =
    regularGames.filter(
      game =>
        n(game.matchup_period) ===
        displayWeek
    );

  const completedWeeks = [
    ...completedByWeek.keys()
  ].sort(
    (a, b) => b - a
  );

  const recapWeek =
    completedWeeks.find(
      completedWeek => {
        const scheduled =
          regularGames.filter(
            game =>
              n(game.matchup_period) ===
              completedWeek
          );

        const scheduledCount =
          new Set(
            scheduled.map(pairKey)
          ).size;

        const completedCount =
          completedByWeek
            .get(completedWeek)
            ?.size || 0;

        return (
          scheduledCount > 0 &&
          completedCount >=
            scheduledCount
        );
      }
    );

  const recap = recapWeek
    ? buildRecap(
        [
          ...completedByWeek
            .get(recapWeek)
            .values()
        ],
        recapWeek,
        ownerMap
      )
    : null;

  const weeklyImpact = buildWeeklyImpact(
    standings,
    completedByWeek,
    recapWeek,
    n(playoffTeamCount) || PLAYOFF_TEAMS
  );

  // ==================================================
  // MATCHUP INTEL + LIVE SCORING
  // ==================================================

  let intel = null;

  let liveScores =
    new Map();

  let nflGames = {};
  let playerBoxScores = {};

  try {
    intel =
      await getMatchupIntel(
        displayWeek
      );
  } catch (error) {
    console.error(
      "Matchup intel failed:",
      error
    );
  }

  try {
    liveScores =
      await getEspnLiveScoreMap(
        season,
        displayWeek
      );
  } catch (error) {
    console.error(
      "Live scores failed:",
      error
    );
  }

  try {
    nflGames = await getNflGameMap(season, displayWeek);
  } catch (error) {
    console.error("NFL game information unavailable:", error);
  }

  try {
    playerBoxScores = await getNflPlayerBoxScores(nflGames);
  } catch (error) {
    console.error("NFL player box scores unavailable:", error);
  }

  const hasLivePoints = [
    ...liveScores.values()
  ].some(
    team =>
      valueOrNull(
        team?.currentPoints
      ) !== null &&
      n(team.currentPoints) > 0
  );

  const hasFinishedMatchup =
    weeklyGames.some(isFinal);

  const live = Boolean(
    intel?.weekStarted ||
    hasLivePoints ||
    hasFinishedMatchup
  );

  const pregame = !live;
  const weekMoments = buildWeekHistory({
    games:league.historicalMatchups || [],
    owners:league.owners || [],
    week:displayWeek,
    currentSeason
  });
  const chicagoDay = Number(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Chicago",day:"numeric"
  }).format(new Date()));
  const featuredMoment = weekMoments.length
    ? weekMoments[chicagoDay % weekMoments.length] : null;
  const recordWatches = live ? buildRecordWatches(league, displayWeek, liveScores) : [];
  const playoffPulse = live ? buildPlayoffPulse(league, displayWeek, liveScores, live) : null;

  // The previous week's recap stays up through Wednesday in
  // the league's Central time zone, then disappears on Thursday.
  const centralWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long"
  }).format(new Date());
  const recapWindowOpen = [
    "Monday",
    "Tuesday",
    "Wednesday"
  ].includes(centralWeekday);

  const showRecap = Boolean(
    !live &&
    recap &&
    recapWeek === displayWeek - 1 &&
    recapWindowOpen
  );

  function teamIntel(ownerId) {
    const espnTeamId =
      standingsByOwner
        .get(ownerId)
        ?.espnTeamId;

    return (
      intel?.teamMap
        ?.get(espnTeamId) ||
      null
    );
  }

  function teamLive(ownerId) {
    const espnTeamId =
      standingsByOwner
        .get(ownerId)
        ?.espnTeamId;

    return (
      liveScores.get(
        espnTeamId
      ) || null
    );
  }

  // ==================================================
  // RANK MATCHUPS
  // ==================================================

  const historical = (
    historicalMatchups.length
      ? historicalMatchups
      : matchups
  ).filter(
    game =>
      n(game.season_year) <
      season
  );

  const rankedMatchups =
    weeklyGames
      .map(game => {
        const awayId =
          n(game.away_owner_id);

        const homeId =
          n(game.home_owner_id);

        const awayStanding =
          standingsByOwner.get(
            awayId
          );

        const homeStanding =
          standingsByOwner.get(
            homeId
          );

        const awayName =
          ownerMap.get(
            awayId
          ) || "Away";

        const homeName =
          ownerMap.get(
            homeId
          ) || "Home";

        const awaySeed =
          awayStanding?.seed ||
          999;

        const homeSeed =
          homeStanding?.seed ||
          999;

        const series =
          headToHead(
            historical,
            awayId,
            homeId
          );

        const rival =
          isRival(
            awayName,
            homeName
          );

        const playoffCount =
          n(playoffTeamCount) ||
          PLAYOFF_TEAMS;

        // Close to the qualification line, or competing for the top seeds.
        // This is a race indicator, not a mathematical clinching forecast.
        const isPlayoffRace = Boolean(
          displayWeek >= 8 &&
          !game.is_consolation &&
          (
            (awaySeed >= Math.max(1, playoffCount - 1) &&
             awaySeed <= playoffCount + 2) ||
            (homeSeed >= Math.max(1, playoffCount - 1) &&
             homeSeed <= playoffCount + 2)
          )
        );

        let hype = 0;

        if (
          awaySeed <= playoffCount &&
          homeSeed <= playoffCount
        ) {
          hype += 15;
        } else if (
          awaySeed <= playoffCount ||
          homeSeed <= playoffCount
        ) {
          hype += 7;
        }

        hype +=
          n(
            awayStanding?.wins
          ) +
          n(
            homeStanding?.wins
          );

        if (
          awaySeed < 999 &&
          homeSeed < 999
        ) {
          hype += Math.max(
            0,
            8 - Math.abs(
              awaySeed - homeSeed
            )
          );
        }

        if (
          rival &&
          displayWeek === 11
        ) {
          hype += 20;
        }

        if (
          Math.abs(
            series.aWins -
              series.bWins
          ) <= 2 &&
          series.aWins +
            series.bWins > 0
        ) {
          hype += 3;
        }

        const notes = [];

        if (
          rival &&
          displayWeek === 11
        ) {
          notes.push(
            rivalryStory(
              awayName,
              homeName,
              series,
              awayStanding,
              homeStanding
            )
          );
        }

        if (
          awaySeed <= playoffCount &&
          homeSeed <= playoffCount
        ) {
          notes.push(
            `Both owners occupy playoff positions (#${awaySeed} and #${homeSeed}).`
          );
        }

        if (
          awayStanding &&
          homeStanding
        ) {
          notes.push(
            `${awayName} enters ${record(
              awayStanding
            )}, while ${homeName} is ${record(
              homeStanding
            )}.`
          );
        }

        return {
          game,
          awayId,
          homeId,
          awayName,
          homeName,
          awayStanding,
          homeStanding,

          awayIntel:
            teamIntel(awayId),

          homeIntel:
            teamIntel(homeId),

          awayLive:
            teamLive(awayId),

          homeLive:
            teamLive(homeId),

          rival,
          playoffImplications: isPlayoffRace,
          week: displayWeek,
          hype,

          analysis:
            notes.join(" "),

          series:
            seriesText(
              series,
              awayName,
              homeName
            )
        };
      })
      .sort(
        (a, b) =>
          b.hype - a.hype
      );

  const gameOfTheWeek =
    rankedMatchups[0];

  const otherMatchups =
    rankedMatchups.slice(1);

  // ==================================================
  // HOMEPAGE RENDER
  // ==================================================

  return (
    <main className="page-shell">
      <AutoRefresh
        enabled
        intervalMs={30000}
      />

      <NflLogoRibbon />

      <section className="owners-hero dp-home-hero">
        <div>
          <p className="eyebrow">
            {season} FANTASY FOOTBALL
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
            {week}
          </strong>

          <span>
            CURRENT WEEK
          </span>
        </div>
      </section>

      <WeeklyImpact impact={weeklyImpact} />

      {/* ==========================================
          OWNER MAPPING WARNINGS
      ========================================== */}

      {unmatchedEspnOwners.length > 0 && (
        <section className="section-block">
          <div className="dp-panel">
            <h3>
              ESPN Owner Mapping Warning
            </h3>

            <p>
              Some ESPN owners could not be
              matched to the archive:
              {" "}
              {unmatchedEspnOwners
                .map(item =>
                  `${item.ownerName} (${item.teamName})`
                )
                .join(", ")}
            </p>
          </div>
        </section>
      )}

      {/* ==========================================
          TWO-DIVISION STANDINGS
      ========================================== */}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {season} SEASON
            </p>

            <h2>
              Current Standings
            </h2>
          </div>

          <span>
            {standings.length} Owners
          </span>
        </div>

        <div className="dp-playoff-legend">
          <span>
            <i className="dp-legend-dot dp-legend-division" />
            Division Leader
          </span>

          <span>
            <i className="dp-legend-dot dp-legend-wildcard" />
            Wild Card
          </span>

          <span>
            <i className="dp-legend-dot dp-legend-outside" />
            Outside Playoffs
          </span>
        </div>

        <div className="dp-divisions-grid">
          {divisionStandings.map(
            division => (
              <div
                className="dp-division-card"
                key={division.id}
              >
                <div className="dp-division-heading">
                  <h3>
                    {division.name}
                  </h3>

                  <span>
                    {division.teams.length}
                    {" "}Teams
                  </span>
                </div>

                <div className="dp-table-wrapper">
                  <table className="dp-standings-table">
                    <thead>
                      <tr>
                        <th>Seed</th>
                        <th>Owner / Team</th>
                        <th>W-L</th>
                        <th>PF</th>
                        <th>Playoff Spot</th>
                      </tr>
                    </thead>

                    <tbody>
                      {division.teams.map(
                        team => {
                          const status =
                            statusMap.get(
                              team.ownerId
                            ) ||
                            "Outside";

                          const isLeader =
                            status ===
                            "Division Leader";

                          const isWildCard =
                            status ===
                            "Wild Card";

                          const isPlayoff =
                            status !==
                            "Outside";

                          return (
                            <tr
                              key={team.ownerId}
                              className={
                                isLeader
                                  ? "dp-row-division"
                                  : isPlayoff
                                  ? "dp-row-wildcard"
                                  : ""
                              }
                            >
                              <td>
                                #
                                {team.seed ||
                                  "—"}
                              </td>

                              <td>
                                <Link
                                  className="dp-standing-owner"
                                  href={
                                    `/owners/${team.ownerId}`
                                  }
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
                                {record(team)}
                              </td>

                              <td>
                                {points(
                                  team.pointsFor
                                )}
                              </td>

                              <td>
                                <span
                                  className={
                                    isLeader
                                      ? "dp-status-division"
                                      : isPlayoff
                                      ? "dp-status-wildcard"
                                      : "dp-status-out"
                                  }
                                >
                                  {isLeader
                                    ? "DIVISION"
                                    : isWildCard
                                    ? "WILD CARD"
                                    : isPlayoff
                                    ? "PLAYOFF"
                                    : "—"}
                                </span>
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>

        <div className="dp-standings-bottom">
          <p className="dp-standings-note">
            {hasTwoDivisions
              ? "Each division leader and the highest-ranked remaining wild cards currently occupy playoff spots. These are not clinched berths."
              : "Current playoff positions are based on ESPN seeding. These are not clinched berths."}
          </p>

          <Link
            href="/playoff-scenarios"
            className="dp-scenarios-link"
          >
            🏆 {season} Playoff Scenarios ↗
          </Link>
        </div>
      </section>

      {/* ==========================================
          AUTOMATIC WEEKLY RECAP
      ========================================== */}

      {showRecap && (
        <AroundTheLeague
          recap={recap}
        />
      )}

      {/* ==========================================
          LIVE RECORD WATCH
      ========================================== */}

      {recordWatches.length > 0 && (
        <section className="section-block dp-live-feature-section">
          <div className="section-heading">
            <div><p className="eyebrow">LEAGUE HISTORY · LIVE</p><h2>Live Record Watch</h2></div>
            <Link href="/records">All records →</Link>
          </div>
          <div className="dp-live-record-grid">
            {recordWatches.map((watch, index) => (
              <div className="dp-live-record-card" key={watch.kind + "-" + index}>
                <div className="dp-live-feature-eyebrow">🔥 {watch.label}</div>
                <strong>{watch.title}</strong>
                <p>{watch.description}</p>
                <div className="dp-record-numbers">
                  <b>{watch.current.toFixed(1)}</b>
                  <small>Archive record {watch.record.toFixed(1)}</small>
                </div>
                <div className="dp-record-progress" role="meter"
                  aria-label={watch.label}
                  aria-valuemin={0} aria-valuemax={watch.record}
                  aria-valuenow={Math.min(watch.current, watch.record)}>
                  <span style={{ width: Math.min(100, 100 * watch.current / Math.max(watch.record,1)) + "%" }}/>
                </div>
                <div className="dp-record-distance">
                  {watch.surpassed
                    ? (watch.final ? "New record in the archive!" : "Above the record mark — pending final score")
                    : watch.distance.toFixed(1) + " points from the record"}
                </div>
              </div>
            ))}
          </div>
          <small className="dp-feature-disclaimer">
            Records use the historical regular-season archive. Live scores can change until final.
          </small>
        </section>
      )}

      {/* ==========================================
          LIVE PLAYOFF PULSE
      ========================================== */}

      {playoffPulse && (
        <section className="section-block dp-live-feature-section">
          <div className="section-heading">
            <div><p className="eyebrow">THE PLAYOFF RACE</p><h2>Live Playoff Pulse</h2></div>
            <Link href="/playoff-scenarios">Playoff scenarios →</Link>
          </div>
          <div className="dp-playoff-pulse">
            <div className="dp-playoff-pulse-header">
              <strong>ESPN odds vs. live matchup estimate</strong>
              <span>Week {displayWeek} · Percentage points, not fantasy points</span>
            </div>
            <div className="dp-playoff-pulse-rows">
              {playoffPulse.movers.map(owner => (
                <div className="dp-playoff-pulse-row" key={owner.ownerId}>
                  <div className="dp-playoff-pulse-owner">
                    <strong>{first(owner.name)}</strong><small>Seed #{owner.seed}</small>
                  </div>
                  <div className="dp-playoff-pulse-track" aria-hidden="true">
                    <span style={{width: owner.after + "%"}}/>
                  </div>
                  <div className="dp-playoff-pulse-comparison">
                    <span className="dp-playoff-pulse-value">
                      <small>{owner.baselineSource === "ESPN published" ? "ESPN" : "Model base"}</small>
                      <b>{owner.before}%</b>
                    </span>
                    <span className="dp-pulse-arrow" aria-label="compared with">→</span>
                    <span className="dp-playoff-pulse-value">
                      <small>Live estimate</small>
                      <strong>{owner.after}%</strong>
                    </span>
                    <small className={"dp-playoff-pulse-delta " + (owner.change>0 ? "dp-pulse-up" : owner.change<0 ? "dp-pulse-down" : "")}>
                      {owner.change>0 ? "+" : ""}{owner.change} pp
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <p><strong>What does the change mean?</strong> The left percentage is ESPN’s published playoff probability when available. The right percentage is Dirty P’s alternative estimate using live projected matchup scores, calibrated to that ESPN benchmark. “pp” means percentage points: for example, 68% → 70% is +2 pp, not two fantasy points. This is a comparison of two estimates, not a measured increase since kickoff or an official clinching scenario.</p>
          </div>
        </section>
      )}

      {/* ==========================================
          LIVE SCOREBOARD
      ========================================== */}

      {live && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                LIVE · WEEK {displayWeek}
              </p>

              <h2>
                Week {displayWeek} Scoreboard
              </h2>
            </div>

            <span>
              Refreshes Every 30 Seconds
            </span>
          </div>

          <div className="dp-matchup-grid dp-live-matchup-grid">
            {rankedMatchups.map(
              matchup => (
                <MatchupCard
                  key={
                    pairKey(matchup.game)
                  }
                  matchup={matchup}
                  nflGames={nflGames}
                  playerBoxScores={playerBoxScores}
                  live
                />
              )
            )}
          </div>
        </section>
      )}

      {/* ==========================================
          GAME OF THE WEEK
      ========================================== */}

      {pregame && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                WEEK {displayWeek} SPOTLIGHT
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
              Game of the Week will
              appear when the schedule
              is available.
            </div>
          )}
        </section>
      )}

      {/* ==========================================
          MATCHUP PREVIEWS
      ========================================== */}

      {pregame && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                WEEK {displayWeek}
              </p>

              <h2>
                Matchup Previews
              </h2>
            </div>

            <span>
              Players to Watch · Head-to-Head
            </span>
          </div>

          {otherMatchups.length ? (
            <div className="dp-matchup-grid">
              {otherMatchups.map(
                matchup => (
                  <MatchupCard
                    key={
                      pairKey(matchup.game)
                    }
                    matchup={matchup}
                  />
                )
              )}
            </div>
          ) : (
            <div className="dp-empty">
              Additional previews will
              appear when the weekly
              schedule is available.
            </div>
          )}
        </section>
      )}

      {/* ==========================================
          THIS WEEK IN DIRTY P HISTORY
      ========================================== */}

      {featuredMoment && (
        <section className="section-block dp-history-week-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM THE ARCHIVE</p>
              <h2>This Week in Dirty P History</h2>
            </div>
            <Link href="/records">Explore records →</Link>
          </div>
          <details className="dp-history-week-feature">
            <summary>
              <span className="dp-history-week-date">
                WEEK {displayWeek} · {featuredMoment.year} THROWBACK
              </span>
              <span className="dp-history-week-headline">
                {featuredMoment.title}
              </span>
              <span className="dp-history-week-bottom">
                <span>{featuredMoment.label}</span>
                <span>See the story <span aria-hidden="true">⌄</span></span>
              </span>
            </summary>
            <div className="dp-history-week-details">
              <p>{featuredMoment.detail}</p>
              {weekMoments.filter(moment=>moment.key!==featuredMoment.key).map(moment=>(
                <div className="dp-history-week-extra" key={moment.key+"-"+moment.label}>
                  <small>{moment.label} · {moment.year}</small>
                  <strong>{moment.title}</strong>
                  <p>{moment.detail}</p>
                </div>
              ))}
              <small>Historical scores from completed regular-season matchups in the Dirty P archive.</small>
            </div>
          </details>
        </section>
      )}

      {/* ==========================================
          FOOTER
      ========================================== */}

      <footer className="site-footer">
        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>
          Independent fantasy league archive.
          Not affiliated with or
          endorsed by ESPN.
        </p>
      </footer>

      {/* ==========================================
          ALL HOMEPAGE STYLES
      ========================================== */}

      <style>{`
        .dp-gold {
          color: var(--dp-gold);
          font-size: 11px;
          font-weight: 800;
        }

        .dp-muted {
          color: var(--dp-muted);
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-panel,
        .dp-empty {
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
          padding: 22px;
          color: var(--dp-muted);
        }

        .dp-panel h3 {
          color: var(--dp-ink);
          font-size: 22px;
          margin: 10px 0;
        }

        .dp-empty {
          text-align: center;
        }

        /* DIVISION STANDINGS */

        .dp-playoff-legend {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px 18px;
          margin: 0 0 14px;
          color: var(--dp-muted);
          font-size: 11px;
        }

        .dp-playoff-legend > span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }

        .dp-legend-dot {
          display: inline-block;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .dp-legend-division {
          background: #58cb98;
        }

        .dp-legend-wildcard {
          background: #e9bd67;
        }

        .dp-legend-outside {
          background: #788494;
        }

        .dp-divisions-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .dp-division-card {
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
          min-width: 0;
          overflow: hidden;
        }

        .dp-division-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-bottom:
            1px solid var(--dp-line);
        }

        .dp-division-heading h3 {
          color: var(--dp-gold);
          font-size: 16px;
          margin: 0;
        }

        .dp-division-heading > span {
          color: var(--dp-muted);
          font-size: 11px;
        }

        .dp-division-card .dp-standings-table {
          min-width: 460px;
        }

        .dp-division-card .dp-standings-table th,
        .dp-division-card .dp-standings-table td {
          padding: 13px 9px;
        }

        .dp-row-division {
          background:
            rgba(88, 203, 152, 0.075);
        }

        .dp-row-wildcard {
          background:
            rgba(233, 189, 103, 0.075);
        }

        .dp-status-division,
        .dp-status-wildcard {
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }

        .dp-status-division {
          color: var(--dp-green);
        }

        .dp-status-wildcard {
          color: var(--dp-gold);
        }

        .dp-table-wrapper {
          width: 100%;
          overflow-x: auto;
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
        }

        .dp-standings-table {
          border-collapse: collapse;
          width: 100%;
          min-width: 560px;
        }

        .dp-standings-table th,
        .dp-standings-table td {
          text-align: left;
          padding: 15px 14px;
          border-bottom:
            1px solid var(--dp-line);
          font-size: 12px;
        }

        .dp-standings-table th {
          color: var(--dp-muted);
          font-size: 10px;
          letter-spacing: 0.7px;
        }

        .dp-standings-table td {
          color: var(--dp-ink);
        }

        .dp-standings-table tr:last-child td {
          border-bottom: 0;
        }

        .dp-standing-owner {
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: var(--dp-ink);
          text-decoration: none;
        }

        .dp-standing-owner span {
          color: var(--dp-muted);
          font-size: 11px;
        }

        .dp-status-playoff {
          color: var(--dp-gold);
          font-weight: 800;
          font-size: 11px;
        }

        .dp-status-out {
          color: var(--dp-muted);
          font-weight: 700;
          font-size: 11px;
        }

        .dp-standings-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }

        .dp-standings-note {
          color: var(--dp-muted);
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }

        .dp-scenarios-link {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid var(--dp-gold-line);
          background: var(--dp-soft);
          border-radius: 7px;
          text-decoration: none;
          color: var(--dp-gold);
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .dp-scenarios-link:hover {
          background: var(--dp-raised);
        }

        /* WEEKLY RECAP */

        .dp-recap-description {
          font-size: 13px;
          color: var(--dp-muted);
          margin: 0 0 15px;
        }

        .dp-recap-grid {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .dp-recap-stat {
          display: flex;
          flex-direction: column;
          gap: 9px;
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 12px;
          padding: 19px;
        }

        .dp-recap-stat:first-child {
          border-color: var(--dp-gold-line);
        }

        .dp-recap-stat > span {
          font-size: 10px;
          letter-spacing: 0.7px;
          font-weight: 800;
          color: var(--dp-gold);
        }

        .dp-recap-stat > strong {
          color: var(--dp-ink);
          font-size: 15px;
        }

        .dp-recap-stat > b {
          font-size: 21px;
          color: var(--dp-gold);
        }

        .dp-recap-stat > small {
          color: var(--dp-muted);
          font-size: 11px;
        }

        .dp-recap-results {
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
          padding: 20px;
          margin-top: 20px;
        }

        .dp-recap-results h3 {
          margin: 0 0 16px;
          color: var(--dp-ink);
        }

        .dp-recap-results-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dp-recap-result {
          background: var(--dp-raised);
          padding: 15px;
          border: 1px solid var(--dp-line);
          border-radius: 10px;
        }

        .dp-recap-final {
          display: block;
          color: var(--dp-muted);
          font-size: 10px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .dp-recap-result-team {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 7px 0;
          font-size: 12px;
          color: var(--dp-muted);
        }

        .dp-recap-result-team a {
          color: inherit;
          text-decoration: none;
        }

        .dp-recap-result-team.winner {
          color: var(--dp-gold);
          font-weight: 800;
        }

        /* MATCHUPS */

        .dp-matchup-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .dp-live-matchup-grid { grid-template-columns:minmax(0,1fr); gap:22px; }
        .dp-matchup-card {
          min-width: 0;
          overflow: hidden;
          background: var(--dp-soft);
          border: 1px solid var(--dp-line);
          border-radius: 14px;
        }

        .dp-featured-matchup {
          border-color: var(--dp-gold-line);
        }

        .dp-matchup-top {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 14px 17px;
          border-bottom: 1px solid var(--dp-pear-line);
          background: var(--dp-pear-wash);
          color: var(--dp-pear-ink);
          font-size: 10px;
          font-weight: 800;
        }

        .dp-featured-matchup .dp-matchup-top {
          background: var(--dp-gold-bg);
          border-color: var(--dp-gold-line);
          color: var(--dp-gold);
        }

        .dp-matchup-top span:last-child {
          color: var(--dp-muted);
        }

        .dp-matchup-versus {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          padding: 20px 10px;
        }

        .dp-matchup-versus-item {
          position: relative;
          min-width: 0;
          text-align: center;
        }

        .dp-vs {
          position: absolute;
          left: 0;
          top: 50%;
          transform:
            translate(-50%, -50%);
          color: var(--dp-gold);
          font-weight: 900;
          font-size: 11px;
        }

        .dp-matchup-team {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 0 10px;
        }

        .dp-matchup-team a {
          color: var(--dp-ink);
          font-size: 16px;
          font-weight: 800;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        .dp-matchup-team small {
          color: var(--dp-muted);
          font-size: 11px;
        }

        .dp-matchup-team strong {
          color: var(--dp-ink);
          font-size: 30px;
        }

        .dp-matchup-analysis,
        .dp-matchup-series {
          color: var(--dp-muted);
          text-align: center;
          padding: 0 18px 15px;
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-matchup-series {
          border-top:
            1px solid var(--dp-line);
          padding: 13px;
          color: var(--dp-gold);
          margin: 0;
        }

        .dp-two-columns {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          border-top:
            1px solid var(--dp-line);
        }

        .dp-two-columns > div + div {
          border-left:
            1px solid var(--dp-line);
        }

        .dp-players-panel,
        .dp-live-lineup {
          min-width: 0;
          padding: 14px;
        }

        .dp-players-heading,
        .dp-live-lineup h4 {
          font-size: 10px;
          font-weight: 900;
          color: var(--dp-gold);
          margin: 0 0 14px;
        }

        .dp-player-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 9px 0;
          border-bottom:
            1px solid var(--dp-line);
          font-size: 11px;
        }

        .dp-player-row strong {
          color: var(--dp-ink);
        }

        .dp-player-row span {
          color: var(--dp-muted);
        }

        /* ESPN-style scoring grid: position, player, projected, actual. */
        .dp-live-statline { color:var(--dp-gold)!important; font-size:10px; line-height:1.5; }
        .dp-player-identity { display:flex; align-items:center; gap:11px; flex-wrap:nowrap; }
        .dp-nfl-logo-badge {
          display:inline-flex; flex:0 0 49px; width:49px; height:49px;
          justify-content:center; align-items:center; border-radius:12px;
          background:linear-gradient(145deg,#ffffff,#e9edf2);
          border:1px solid var(--dp-line); box-shadow:0 3px 10px rgba(31, 49, 72, 0.16);
        }
        .dp-nfl-logo-badge .dp-nfl-logo { width:38px; height:38px; object-fit:contain; }
        @media(max-width:550px) {
          .dp-nfl-logo-badge { flex-basis:42px; width:42px; height:42px; border-radius:10px; }
          .dp-nfl-logo-badge .dp-nfl-logo { width:33px; height:33px; }
          .dp-live-columns .dp-player-identity { gap:7px; }
        }
        .dp-player-opponent { display:flex; align-items:center; min-height:22px; }
        .dp-player-identity strong { min-width:0; overflow-wrap:anywhere; }
        .dp-player-game { color:var(--dp-muted); font-size:10px; }
        .dp-player-game strong { color:var(--dp-ink); font-size:10px; }
        .dp-nfl-logo { object-fit:contain; flex-shrink:0; vertical-align:middle; }
        .dp-broadcast-network { color:var(--dp-gold)!important; }
        .dp-nfl-watch { color:var(--dp-muted); text-decoration:underline; font-size:10px; font-weight:700; width:fit-content; }
                .dp-espn-lineup { padding: 0; }
        .dp-espn-team-title { padding: 13px 12px; color: var(--dp-gold); font-size: 11px; letter-spacing: .7px; font-weight: 900; }
        .dp-espn-columns, .dp-espn-player {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) minmax(105px, 1fr) 53px;
          align-items: center;
          column-gap: 7px;
        }
        .dp-espn-columns {
          background: var(--dp-soft);
          border-top: 1px solid var(--dp-deep-line);
          border-bottom: 1px solid var(--dp-deep-line);
          color: var(--dp-muted);
          padding: 9px 10px;
          font-size: 10px;
          font-weight: 800;
        }
        .dp-espn-columns span:nth-child(3), .dp-espn-columns span:nth-child(4) { text-align: right; }
        .dp-espn-stat-focus { text-align:right; overflow-wrap:anywhere; line-height:1.35; font-variant-numeric:tabular-nums; color:var(--dp-muted); font-size:12px; font-weight:700; }
        .dp-espn-stat-active { font-size:13px; font-weight:900; color:var(--dp-gold); letter-spacing:.08px; }
        .dp-espn-player:has(.dp-espn-stat-active) { min-height:94px; }
        .dp-espn-player:has(.dp-espn-stat-active) .dp-espn-actual { font-size:17px; color:var(--dp-ink); font-weight:900; }
        .dp-espn-player {
          min-height: 52px;
          padding: 9px 10px;
          background: var(--dp-raised);
          border-bottom: 1px solid var(--dp-deep-line);
        }
        .dp-espn-player:nth-child(even) { background: var(--dp-raised); }
        .dp-espn-slot { color: var(--dp-gold); font-size: 10px; font-weight: 900; }
        .dp-espn-player-info { min-width: 0; display: grid; gap: 4px; }
        .dp-espn-player-info strong { font-size: 11px; color: var(--dp-ink); overflow-wrap: anywhere; }
        .dp-espn-player-info small { font-size: 10px; color: var(--dp-muted); }
        .dp-espn-number { text-align: right; font-variant-numeric: tabular-nums; color: var(--dp-muted); font-size: 11px; }
        .dp-espn-projection { display:flex; flex-direction:column; align-items:flex-end; gap:3px; font-weight:800; color:var(--dp-ink); font-size:13px; }
        .dp-espn-projection small { color:var(--dp-muted); font-size:9px; font-weight:700; letter-spacing:.4px; }
        .dp-espn-actual { color: var(--dp-ink); font-size: 12px; }
        .dp-espn-bench { background: var(--dp-soft); }
        .dp-espn-bench > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; padding: 12px; cursor: pointer; color: var(--dp-gold); font-weight: 800; font-size: 11px; }
        .dp-espn-bench > summary::-webkit-details-marker { display: none; }
        .dp-espn-bench[open] > summary span { transform: rotate(180deg); }
        @media(max-width: 480px) {
          .dp-espn-columns, .dp-espn-player { grid-template-columns: 27px minmax(0, 1fr) minmax(83px, .95fr) 47px; column-gap: 5px; }
          .dp-espn-stat-active { font-size:12px; }
          .dp-espn-player:has(.dp-espn-stat-active) .dp-espn-actual { font-size:15px; }
          .dp-espn-columns, .dp-espn-player { padding-left: 6px; padding-right: 6px; }
          .dp-espn-player-info strong { font-size: 10px; }
        }

        /* Readable live fantasy scoreboard: one full-width matchup per card. */
        .dp-live-matchup-grid .dp-matchup-card { border-color:var(--dp-deep-line); box-shadow:0 5px 20px rgba(31, 49, 72, 0.13); }
        .dp-live-matchup-grid .dp-matchup-versus { padding:22px 14px; background:var(--dp-raised); }
        .dp-live-columns { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .dp-live-columns .dp-espn-team-title { font-size:14px; padding:17px 15px; }
        .dp-live-columns .dp-espn-columns, .dp-live-columns .dp-espn-player {
          grid-template-columns:38px minmax(115px,1.2fr) minmax(124px,1.15fr) 73px;
          column-gap:12px; padding-left:14px; padding-right:14px;
        }
        .dp-live-columns .dp-espn-columns { font-size:11px; padding-top:12px; padding-bottom:12px; }
        .dp-live-columns .dp-espn-player { padding-top:13px; padding-bottom:13px; min-height:82px; }
        .dp-live-columns .dp-espn-player-info { gap:6px; }
        .dp-live-columns .dp-player-identity { gap:8px; }
        .dp-live-columns .dp-player-identity strong { font-size:14px; line-height:1.35; }
        .dp-live-columns .dp-espn-player-info small { font-size:12px; line-height:1.4; }
        .dp-live-columns .dp-espn-slot { font-size:12px; }
        .dp-live-columns .dp-espn-stat-focus { font-size:13px; line-height:1.5; }
        .dp-live-columns .dp-espn-stat-active { font-size:15px; }
        .dp-live-columns .dp-espn-actual { font-size:18px; color:var(--dp-ink); }
        .dp-live-columns .dp-espn-projection { font-size:18px; }
        .dp-live-columns .dp-espn-projection small { font-size:10px; }
        @media(max-width:1050px) {
          .dp-live-columns { grid-template-columns:minmax(0,1fr); }
          .dp-live-columns>div+div { border-left:0; border-top:3px solid var(--dp-deep-line); }
          .dp-live-columns .dp-espn-columns,.dp-live-columns .dp-espn-player { grid-template-columns:37px minmax(0,1.3fr) minmax(105px,1fr) 70px; }
        }
        @media(max-width:550px) {
          .dp-live-columns .dp-espn-columns,.dp-live-columns .dp-espn-player {
            grid-template-columns:28px minmax(0,1.15fr) minmax(85px,1fr) 54px; gap:6px; padding-left:8px; padding-right:8px;
          }
          .dp-live-columns .dp-espn-player { padding-top:12px; padding-bottom:12px; }
          .dp-live-columns .dp-player-identity strong { font-size:12px; }
          .dp-live-columns .dp-espn-player-info small { font-size:11px; }
          .dp-live-columns .dp-espn-stat-active { font-size:13px; }
          .dp-live-columns .dp-espn-actual { font-size:16px; }
          .dp-live-columns .dp-espn-projection { font-size:16px; }
          .dp-live-columns .dp-espn-team-title { font-size:13px; }
        }


        /* Collapsible, easy-to-scan scoreboard on all screen sizes. */
        .dp-live-matchup-details > summary {
          display:block; list-style:none; cursor:pointer;
          outline-offset:-3px;
        }
        .dp-live-matchup-details > summary::-webkit-details-marker { display:none; }
        .dp-live-matchup-details > summary:focus-visible {
          outline:2px solid var(--dp-gold-line); border-radius:12px;
        }
        .dp-live-matchup-grid .dp-matchup-top { padding:12px 18px; }
        .dp-live-matchup-grid .dp-matchup-versus { padding:18px 14px; }
        .dp-live-matchup-grid .dp-matchup-team-label {
          color:var(--dp-ink); font-size:17px; font-weight:900;
          line-height:1.3; overflow-wrap:anywhere;
        }
        .dp-live-matchup-grid .dp-matchup-team strong {
          font-size:clamp(30px,3vw,38px); letter-spacing:-.6px;
          font-variant-numeric:tabular-nums;
        }
        .dp-matchup-expand-row {
          display:flex; justify-content:space-between; align-items:center;
          gap:10px; padding:11px 18px 12px; border-top:1px solid var(--dp-deep-line);
          color:var(--dp-muted); font-size:12px; font-weight:750;
          background:var(--dp-raised);
        }
        .dp-matchup-expand-action { display:flex;align-items:center;gap:10px;color:var(--dp-gold); }
        .dp-matchup-expand-chevron {
          display:inline-flex; justify-content:center; align-items:center;
          width:24px; height:24px; border-radius:7px;
          background:var(--dp-strong); color:var(--dp-ink); font-size:22px;
          transition:transform .18s;
        }
        .dp-live-matchup-details[open] .dp-matchup-expand-chevron { transform:rotate(180deg); }
        .dp-live-matchup-details[open] .dp-matchup-expand-text::after { content:""; }
        .dp-live-matchup-details > .dp-live-columns { border-top:1px solid var(--dp-deep-line); }
        @media(max-width:700px) {
          .dp-live-matchup-grid { gap:13px; }
          .dp-live-matchup-grid .dp-matchup-card { border-radius:16px; }
          .dp-live-matchup-grid .dp-matchup-top { padding:10px 13px; font-size:10px; }
          .dp-live-matchup-grid .dp-matchup-versus { padding:16px 7px 14px; }
          .dp-live-matchup-grid .dp-matchup-team { padding:0 4px; gap:5px; }
          .dp-live-matchup-grid .dp-matchup-team-label { font-size:13px; line-height:1.25; }
          .dp-live-matchup-grid .dp-matchup-team small { font-size:11px; line-height:1.3; }
          .dp-live-matchup-grid .dp-matchup-record { display:none; }
          .dp-live-matchup-grid .dp-matchup-team strong { font-size:30px; line-height:1.1; }
          .dp-live-matchup-grid .dp-team-projected { font-size:11px; }
          .dp-matchup-expand-row { padding:11px 13px; font-size:12px; }
          .dp-live-columns .dp-espn-columns { display:none; }
          .dp-live-columns .dp-espn-team-title {
            padding:15px 12px; font-size:14px; background:var(--dp-raised);
            border-bottom:1px solid var(--dp-deep-line);
          }
          .dp-live-columns .dp-espn-player {
            display:grid;
            grid-template-columns:26px minmax(0,1fr) 66px;
            grid-template-areas:"slot player points" ". stats points";
            align-items:center;
            column-gap:10px; row-gap:5px;
            padding:13px 12px; min-height:85px;
          }
          .dp-live-columns .dp-espn-slot {
            grid-area:slot; align-self:center; font-size:11px;
          }
          .dp-live-columns .dp-espn-player-info {
            grid-area:player; gap:3px;
          }
          .dp-live-columns .dp-espn-player-info small {
            font-size:11.5px; color:var(--dp-muted); line-height:1.4;
          }
          .dp-live-columns .dp-player-identity { gap:9px; }
          .dp-live-columns .dp-player-identity strong { font-size:14px; line-height:1.3; }
          .dp-live-columns .dp-espn-stat-focus {
            grid-area:stats; text-align:left; line-height:1.45;
            color:var(--dp-gold); font-size:14px; overflow-wrap:break-word;
          }
          .dp-live-columns .dp-espn-stat-focus:not(.dp-espn-stat-active) { display:none; }
          .dp-live-columns .dp-espn-stat-active { font-size:14px; font-weight:850; }
          .dp-live-columns .dp-espn-number {
            grid-area:points; text-align:right; align-self:center;
            font-size:18px; font-weight:900;
          }
          .dp-live-columns .dp-espn-projection { font-size:18px; }
          .dp-live-columns .dp-espn-projection small { font-size:10px; }
          .dp-live-columns .dp-espn-player:has(.dp-espn-stat-active) { min-height:97px; }
          .dp-live-columns .dp-espn-player:has(.dp-espn-stat-active) .dp-espn-actual { font-size:18px; }
          .dp-live-columns .dp-nfl-logo-badge {
            flex:0 0 42px; width:42px; height:42px;
          }
          .dp-live-columns .dp-nfl-logo-badge .dp-nfl-logo { width:33px; height:33px; }
          .dp-live-columns .dp-espn-bench > summary { font-size:13px; padding:15px 12px; }
        }


        /* On phones, open one team at a time. Desktop keeps both lineups. */
        .dp-matchup-mobile-tabs { display:none; }
        @media(max-width:700px) {
          .dp-matchup-mobile-tabs {
            display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
            gap:8px; padding:11px 12px; background:var(--dp-soft);
            border-bottom:1px solid var(--dp-deep-line);
          }
          .dp-matchup-mobile-tabs button {
            padding:12px 7px; min-height:45px;
            border:1px solid var(--dp-deep-line); border-radius:10px;
            background:var(--dp-raised); color:var(--dp-muted);
            font-size:13px; font-family:inherit; font-weight:850;
            overflow-wrap:anywhere; cursor:pointer;
          }
          .dp-matchup-mobile-tabs button.dp-selected {
            color:#131821; background:#edc379; border-color:var(--dp-gold-line);
          }
          .dp-matchup-mobile-tabs button:focus-visible { outline:2px solid var(--dp-line); outline-offset:2px; }
          .dp-matchup-lineup-switcher .dp-live-columns { display:block; }
          .dp-matchup-side-0 .dp-live-columns > :nth-child(2) { display:none; }
          .dp-matchup-side-1 .dp-live-columns > :nth-child(1) { display:none; }
          .dp-matchup-lineup-switcher .dp-live-columns > div { border:0; }
        }

        .dp-live-matchup-grid .dp-matchup-card.dp-playoff-implications {
          border:2px solid var(--dp-green-line);
          box-shadow:0 0 0 1px rgba(55,180,112,.22), 0 4px 20px rgba(31, 49, 72, 0.15);
        }
        .dp-playoff-implications-label {
          display:flex; align-items:center; gap:7px;
          padding:9px 16px;
          color:var(--dp-green); background:var(--dp-green-bg);
          font-size:11px; font-weight:900; letter-spacing:.55px;
        }
        .dp-playoff-implications-label small {
          margin-left:auto; color:var(--dp-green);
          font-size:10px; font-weight:600; letter-spacing:0;
        }
        @media(max-width:600px){
          .dp-playoff-implications-label { padding:9px 12px; font-size:10px; }
          .dp-playoff-implications-label small { font-size:9px; }
        }


        /* Compact live features; never compete with the scoreboard. */
        .dp-live-feature-section { margin-bottom:24px; }
        .dp-live-record-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr)); gap:13px; }
        .dp-live-record-card {
          padding:19px;border:1px solid var(--dp-gold-line);border-radius:14px;
          background:linear-gradient(140deg,var(--dp-raised),var(--dp-soft));min-width:0;
        }
        .dp-live-feature-eyebrow {color:var(--dp-gold);font-size:10px;letter-spacing:.8px;font-weight:900;margin-bottom:11px;}
        .dp-live-record-card>strong {display:block;font-size:16px;line-height:1.35;color:var(--dp-ink);}
        .dp-live-record-card p {color:var(--dp-muted);font-size:12px;line-height:1.5;min-height:30px;margin:8px 0 14px;}
        .dp-record-numbers {display:flex;align-items:baseline;justify-content:space-between;gap:12px;}
        .dp-record-numbers b {font-size:30px;font-weight:900;color:var(--dp-ink);font-variant-numeric:tabular-nums;}
        .dp-record-numbers small {color:var(--dp-gold);font-size:11px;}
        .dp-record-progress {height:9px;background:var(--dp-strong);border-radius:20px;margin:10px 0;overflow:hidden;}
        .dp-record-progress span {display:block;height:100%;background:#e9bd67;border-radius:20px;}
        .dp-record-distance {color:var(--dp-gold);font-size:12px;font-weight:750;}
        .dp-feature-disclaimer {display:block;color:var(--dp-muted);font-size:11px;margin-top:9px;line-height:1.5;}
        .dp-playoff-pulse {padding:20px;background:var(--dp-green-bg);border:1px solid var(--dp-green-line);border-radius:14px;}
        .dp-playoff-pulse-header {display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:18px;flex-wrap:wrap;}
        .dp-playoff-pulse-header strong {font-size:15px;color:var(--dp-ink);}
        .dp-playoff-pulse-header span {color:var(--dp-green);font-size:11px;}
        .dp-playoff-pulse-rows {display:grid;gap:13px;}
        .dp-playoff-pulse-row {display:grid;grid-template-columns:95px minmax(55px,1fr) minmax(210px,240px);align-items:center;gap:13px;}
        .dp-playoff-pulse-owner {display:flex;flex-direction:column;gap:4px;min-width:0;}
        .dp-playoff-pulse-owner strong {color:var(--dp-ink);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .dp-playoff-pulse-owner small {color:var(--dp-green);font-size:10px;}
        .dp-playoff-pulse-track {height:10px;border-radius:8px;background:var(--dp-green-bg);overflow:hidden;}
        .dp-playoff-pulse-track span {display:block;height:100%;border-radius:8px;background:#5bc68c;}
        .dp-playoff-pulse-comparison {display:flex;justify-content:flex-end;align-items:center;gap:10px;font-variant-numeric:tabular-nums;white-space:nowrap;}
        .dp-playoff-pulse-value {display:flex;flex-direction:column;gap:3px;align-items:center;}
        .dp-playoff-pulse-value small {font-size:10px;color:var(--dp-green);}
        .dp-playoff-pulse-value b {font-size:16px;color:var(--dp-green);}
        .dp-playoff-pulse-value strong {font-size:19px;color:var(--dp-ink);}
        .dp-pulse-arrow {color:var(--dp-green);font-size:17px;}
        .dp-playoff-pulse-delta {font-size:11px;color:var(--dp-green);text-align:right;min-width:35px;}
        .dp-playoff-pulse-comparison .dp-pulse-up {color:var(--dp-green);}
        .dp-playoff-pulse-comparison .dp-pulse-down {color:var(--dp-red);}
        .dp-playoff-pulse>p {font-size:11px;line-height:1.6;color:var(--dp-green);border-top:1px solid var(--dp-green-line);padding-top:13px;margin:19px 0 0;}
        @media(max-width:550px) {
          .dp-playoff-pulse {padding:15px 12px;}
          .dp-playoff-pulse-row {grid-template-columns:1fr 1fr;gap:7px 10px;padding:7px 0;border-bottom:1px solid var(--dp-green-line);}
          .dp-playoff-pulse-owner {grid-column:1;grid-row:1;}
          .dp-playoff-pulse-comparison {grid-column:2;grid-row:1;gap:5px;justify-content:flex-end;}
          .dp-playoff-pulse-value small {font-size:9px;}
          .dp-playoff-pulse-value b,.dp-playoff-pulse-value strong {font-size:16px;}
          .dp-playoff-pulse-delta {font-size:10px;min-width:26px;}
          .dp-playoff-pulse-track {grid-column:1 / -1;grid-row:2;}
          .dp-playoff-pulse-header {gap:5px;}
          .dp-live-record-card {padding:15px;}
        }

        .dp-live-player {
          display: grid;
          grid-template-columns:
            36px minmax(0, 1fr) 50px;
          align-items: center;
          gap: 6px;
          padding: 10px 0;
          border-bottom:
            1px solid var(--dp-line);
        }

        .dp-live-slot {
          color: var(--dp-gold);
          font-size: 10px;
          font-weight: 800;
        }

        .dp-live-player-name {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .dp-live-player-name strong {
          color: var(--dp-ink);
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .dp-live-player-name small {
          color: var(--dp-muted);
          font-size: 10px;
        }

        .dp-live-player > b {
          color: var(--dp-ink);
          text-align: right;
          font-size: 12px;
        }

        @media(max-width:1100px) {
          .dp-divisions-grid {
            grid-template-columns: 1fr;
          }
        }

        @media(max-width:1000px) {
          .dp-recap-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media(max-width:850px) {
          .dp-matchup-grid {
            grid-template-columns: 1fr;
          }
        }

        @media(max-width:600px) {
          .dp-recap-results-grid {
            grid-template-columns: 1fr;
          }
        }

        @media(max-width:480px) {
          .dp-recap-grid {
            grid-template-columns: 1fr;
          }

          .dp-live-lineup,
          .dp-players-panel {
            padding: 10px;
          }

          .dp-live-player {
            grid-template-columns:
              28px minmax(0, 1fr) 43px;
            gap: 4px;
          }

          .dp-matchup-team a {
            font-size: 12px;
          }

          .dp-matchup-team strong {
            font-size: 23px;
          }
        }
        /* Home and live-score layout tuned for iPad-sized screens. */
        @media (min-width:700px) and (max-width:1199px) {
          .dp-recap-grid {
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:12px;
          }
          .dp-recap-stat {padding:16px;}
          .dp-live-record-grid {
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:12px;
          }
          .dp-live-record-card {padding:17px;}
          .dp-live-matchup-grid {
            grid-template-columns:minmax(0,1fr);
            gap:18px;
          }
          .dp-live-matchup-grid .dp-matchup-versus {
            padding:17px 13px;
          }
          .dp-matchup-top {padding:12px 15px;}
          .dp-matchup-expand-row {padding:12px 14px;}
          .dp-playoff-pulse-row {
            grid-template-columns:100px minmax(50px,1fr) minmax(200px,230px);
            gap:10px;
          }
          .dp-live-columns .dp-espn-team-title {
            padding:14px 13px;
          }
          .dp-live-columns .dp-espn-player {
            padding-top:11px;
            padding-bottom:11px;
          }
        }
        @media (min-width:700px) and (max-width:1050px) {
          .dp-live-columns {grid-template-columns:minmax(0,1fr);}
          .dp-live-columns > div + div {
            border-left:0;
            border-top:3px solid var(--dp-deep-line);
          }
          .dp-live-columns .dp-espn-columns,
          .dp-live-columns .dp-espn-player {
            grid-template-columns:37px minmax(0,1.3fr) minmax(105px,1fr) 70px;
            column-gap:10px;
          }
        }
        @media (min-width:700px) and (max-width:899px) {
          .dp-divisions-grid {grid-template-columns:minmax(0,1fr);}
          .dp-matchup-grid {grid-template-columns:minmax(0,1fr);}
          .dp-playoff-pulse-row {
            grid-template-columns:90px minmax(42px,1fr) minmax(165px,210px);
            gap:8px;
          }
        }
        @media (min-width:900px) and (max-width:1100px) {
          .dp-divisions-grid {grid-template-columns:minmax(0,1fr);}
        }
        @media (min-width:900px) and (max-width:1199px) {
          .dp-matchup-grid {grid-template-columns:repeat(2,minmax(0,1fr));}
        }
        @media (min-width:1051px) and (max-width:1199px) {
          .dp-live-columns {grid-template-columns:repeat(2,minmax(0,1fr));}
        }

      `}</style>
    </main>
  );
}
