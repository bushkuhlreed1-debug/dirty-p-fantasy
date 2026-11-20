
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { getLeagueData } from "../lib/leagueData";
import { getMatchupIntel } from "../lib/matchupIntel";
import { getEspnLiveScoreMap } from "../lib/espnLiveScore";
import { getNflGameMap } from "../lib/nflGameScores";
import { getNflPlayerBoxScores } from "../lib/nflPlayerBoxScores";
import AutoRefresh from "./components/AutoRefresh";

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

  const highest = [
    ...performances
  ].sort(
    (a, b) =>
      b.score - a.score
  )[0];

  const lowest = [
    ...performances
  ].sort(
    (a, b) =>
      a.score - b.score
  )[0];

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
    highest,
    lowest,
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

function AroundTheLeague({ recap }) {
  if (!recap) return null;

  const {
    week,
    results,
    highest,
    lowest,
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

        <RecapStat
          label="🏆 HIGHEST SCORER"
          name={highest?.name || "—"}
          value={
            `${points(
              highest?.score
            )} PTS`
          }
          detail="Best team performance"
        />

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

        <RecapStat
          label="🛡️ LOWEST SCORER"
          name={lowest?.name || "—"}
          value={
            `${points(
              lowest?.score
            )} PTS`
          }
          detail="Lowest fantasy team score"
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

function NflTeamLogo({ code, size = 22 }) {
  const normalized = ({ WSH: "was", JAC: "jax", LA: "lar", OAK: "lv", SD: "lac", STL: "lar" })[String(code || "").toUpperCase()] || String(code || "").toLowerCase();
  if (!normalized) return null;
  return <img
    src={`https://a.espncdn.com/i/teamlogos/nfl/500/${normalized}.png`}
    alt={`${code} logo`}
    width={size}
    height={size}
    loading="lazy"
    className="dp-nfl-logo"
  />;
}

function EspnLineupRows({ players, nflGames = {}, playerBoxScores = {} }) {
  return players.map((player, index) => {
    const actual = valueOrNull(player.currentPoints ?? player.actualPoints);
    const projected = valueOrNull(player.projectedPoints);
    const nflGame = nflGames[String(player.nflTeam || "").toUpperCase()] || null;
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

  return (
    <article
      className={
        "dp-matchup-card " +
        (
          featured
            ? "dp-featured-matchup"
            : ""
        )
      }
    >
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
              <Link
                href={
                  `/owners/${side.ownerId}`
                }
              >
                {side.standing?.teamName ||
                  side.name}
              </Link>

              <small>
                {side.name}
              </small>

              <small>
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

      {live ? (
        <div className="dp-two-columns dp-live-columns">
          {sides.map(side => (
            <LiveLineup
              key={side.ownerId}
              name={first(side.name)}
              team={side.liveTeam}
              nflGames={nflGames}
              playerBoxScores={playerBoxScores}
            />
          ))}
        </div>
      ) : (
        <>
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
  // DEFENDING CHAMPION
  // ==================================================

  const {
    data: championRows
  } = await supabase
    .from("seasons")
    .select(`
      year,
      champion:champion_owner_id(name),
      runner_up:runner_up_owner_id(name)
    `)
    .lt("year", season)
    .order(
      "year",
      { ascending: false }
    )
    .limit(1);

  const defending =
    championRows?.[0] || null;

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

      <section className="owners-hero">
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

      {/* ==========================================
          DEFENDING CHAMPION
      ========================================== */}

      {defending?.champion && (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                DEFENDING CHAMPION
              </p>

              <h2>
                {defending.champion.name}
              </h2>
            </div>

            <Link href="/champions">
              Championship History →
            </Link>
          </div>

          <div className="dp-panel">
            <span className="dp-gold">
              {defending.year} DIRTY P CHAMPION
            </span>

            <h3>
              {defending.champion.name}
            </h3>

            {defending.runner_up?.name && (
              <p>
                Defeated{" "}
                {defending.runner_up.name}
                {" "}in the championship game.
              </p>
            )}
          </div>
        </section>
      )}

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
          color: #e9bd67;
          font-size: 11px;
          font-weight: 800;
        }

        .dp-muted {
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-panel,
        .dp-empty {
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
          padding: 22px;
          color: #aeb9c7;
        }

        .dp-panel h3 {
          color: #f5f6f8;
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
          color: #aeb9c7;
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
          background: #171d26;
          border: 1px solid #303947;
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
            1px solid #303947;
        }

        .dp-division-heading h3 {
          color: #e9bd67;
          font-size: 16px;
          margin: 0;
        }

        .dp-division-heading > span {
          color: #9aa7b8;
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
          color: #58cb98;
        }

        .dp-status-wildcard {
          color: #e9bd67;
        }

        .dp-table-wrapper {
          width: 100%;
          overflow-x: auto;
          background: #171d26;
          border: 1px solid #303947;
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
            1px solid #303947;
          font-size: 12px;
        }

        .dp-standings-table th {
          color: #9aa7b8;
          font-size: 10px;
          letter-spacing: 0.7px;
        }

        .dp-standings-table td {
          color: #e6eaf0;
        }

        .dp-standings-table tr:last-child td {
          border-bottom: 0;
        }

        .dp-standing-owner {
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: #f3f4f6;
          text-decoration: none;
        }

        .dp-standing-owner span {
          color: #929ead;
          font-size: 11px;
        }

        .dp-status-playoff {
          color: #e9bd67;
          font-weight: 800;
          font-size: 11px;
        }

        .dp-status-out {
          color: #8895a5;
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
          color: #909cab;
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }

        .dp-scenarios-link {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid #806539;
          background: #25291f;
          border-radius: 7px;
          text-decoration: none;
          color: #e9bd67;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .dp-scenarios-link:hover {
          background: #333526;
        }

        /* WEEKLY RECAP */

        .dp-recap-description {
          font-size: 13px;
          color: #aeb9c7;
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
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 12px;
          padding: 19px;
        }

        .dp-recap-stat:first-child {
          border-color: #806539;
        }

        .dp-recap-stat > span {
          font-size: 10px;
          letter-spacing: 0.7px;
          font-weight: 800;
          color: #e9bd67;
        }

        .dp-recap-stat > strong {
          color: #f5f6f8;
          font-size: 15px;
        }

        .dp-recap-stat > b {
          font-size: 21px;
          color: #e9bd67;
        }

        .dp-recap-stat > small {
          color: #aeb9c7;
          font-size: 11px;
        }

        .dp-recap-results {
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
          padding: 20px;
          margin-top: 20px;
        }

        .dp-recap-results h3 {
          margin: 0 0 16px;
          color: #f5f6f8;
        }

        .dp-recap-results-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dp-recap-result {
          background: #1d2530;
          padding: 15px;
          border: 1px solid #303947;
          border-radius: 10px;
        }

        .dp-recap-final {
          display: block;
          color: #9aa7b8;
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
          color: #aeb9c7;
        }

        .dp-recap-result-team a {
          color: inherit;
          text-decoration: none;
        }

        .dp-recap-result-team.winner {
          color: #e9bd67;
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
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
        }

        .dp-featured-matchup {
          border-color: #806539;
        }

        .dp-matchup-top {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 14px 17px;
          border-bottom:
            1px solid #303947;
          color: #e9bd67;
          font-size: 10px;
          font-weight: 800;
        }

        .dp-matchup-top span:last-child {
          color: #aab6c3;
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
          color: #e9bd67;
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
          color: #f3f5f7;
          font-size: 16px;
          font-weight: 800;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        .dp-matchup-team small {
          color: #aeb9c7;
          font-size: 11px;
        }

        .dp-matchup-team strong {
          color: #f5f6f8;
          font-size: 30px;
        }

        .dp-matchup-analysis,
        .dp-matchup-series {
          color: #aeb9c7;
          text-align: center;
          padding: 0 18px 15px;
          font-size: 12px;
          line-height: 1.6;
        }

        .dp-matchup-series {
          border-top:
            1px solid #303947;
          padding: 13px;
          color: #d6b77c;
          margin: 0;
        }

        .dp-two-columns {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          border-top:
            1px solid #303947;
        }

        .dp-two-columns > div + div {
          border-left:
            1px solid #303947;
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
          color: #e9bd67;
          margin: 0 0 14px;
        }

        .dp-player-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 9px 0;
          border-bottom:
            1px solid #29313d;
          font-size: 11px;
        }

        .dp-player-row strong {
          color: #f0f2f5;
        }

        .dp-player-row span {
          color: #9ba8b7;
        }

        /* ESPN-style scoring grid: position, player, projected, actual. */
        .dp-live-statline { color:#e2ca8c!important; font-size:10px; line-height:1.5; }
        .dp-player-identity { display:flex; align-items:center; gap:11px; flex-wrap:nowrap; }
        .dp-nfl-logo-badge {
          display:inline-flex; flex:0 0 49px; width:49px; height:49px;
          justify-content:center; align-items:center; border-radius:12px;
          background:linear-gradient(145deg,#ffffff,#e9edf2);
          border:1px solid #cbd3df; box-shadow:0 3px 10px rgba(0,0,0,.3);
        }
        .dp-nfl-logo-badge .dp-nfl-logo { width:38px; height:38px; object-fit:contain; }
        @media(max-width:550px) {
          .dp-nfl-logo-badge { flex-basis:42px; width:42px; height:42px; border-radius:10px; }
          .dp-nfl-logo-badge .dp-nfl-logo { width:33px; height:33px; }
          .dp-live-columns .dp-player-identity { gap:7px; }
        }
        .dp-player-opponent { display:flex; align-items:center; min-height:22px; }
        .dp-player-identity strong { min-width:0; overflow-wrap:anywhere; }
        .dp-player-game { color:#b7cce0; font-size:10px; }
        .dp-player-game strong { color:#e7edf5; font-size:10px; }
        .dp-nfl-logo { object-fit:contain; flex-shrink:0; vertical-align:middle; }
        .dp-broadcast-network { color:#e3bf7c!important; }
        .dp-nfl-watch { color:#73b9f2; text-decoration:underline; font-size:10px; font-weight:700; width:fit-content; }
                .dp-espn-lineup { padding: 0; }
        .dp-espn-team-title { padding: 13px 12px; color: #f0c676; font-size: 11px; letter-spacing: .7px; font-weight: 900; }
        .dp-espn-columns, .dp-espn-player {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) minmax(105px, 1fr) 53px;
          align-items: center;
          column-gap: 7px;
        }
        .dp-espn-columns {
          background: #101925;
          border-top: 1px solid #324050;
          border-bottom: 1px solid #394a60;
          color: #a7b8ca;
          padding: 9px 10px;
          font-size: 10px;
          font-weight: 800;
        }
        .dp-espn-columns span:nth-child(3), .dp-espn-columns span:nth-child(4) { text-align: right; }
        .dp-espn-stat-focus { text-align:right; overflow-wrap:anywhere; line-height:1.35; font-variant-numeric:tabular-nums; color:#b6c7d8; font-size:12px; font-weight:700; }
        .dp-espn-stat-active { font-size:13px; font-weight:900; color:#f0cb85; letter-spacing:.08px; }
        .dp-espn-player:has(.dp-espn-stat-active) { min-height:94px; }
        .dp-espn-player:has(.dp-espn-stat-active) .dp-espn-actual { font-size:17px; color:#fff; font-weight:900; }
        .dp-espn-player {
          min-height: 52px;
          padding: 9px 10px;
          background: #1b2634;
          border-bottom: 1px solid #314051;
        }
        .dp-espn-player:nth-child(even) { background: #202d3d; }
        .dp-espn-slot { color: #eac47f; font-size: 10px; font-weight: 900; }
        .dp-espn-player-info { min-width: 0; display: grid; gap: 4px; }
        .dp-espn-player-info strong { font-size: 11px; color: #f1f5fa; overflow-wrap: anywhere; }
        .dp-espn-player-info small { font-size: 10px; color: #a8b9cc; }
        .dp-espn-number { text-align: right; font-variant-numeric: tabular-nums; color: #b6c7d8; font-size: 11px; }
        .dp-espn-projection { display:flex; flex-direction:column; align-items:flex-end; gap:3px; font-weight:800; color:#d5dfeb; font-size:13px; }
        .dp-espn-projection small { color:#9aaec3; font-size:9px; font-weight:700; letter-spacing:.4px; }
        .dp-espn-actual { color: #f6f7fb; font-size: 12px; }
        .dp-espn-bench { background: #151e2a; }
        .dp-espn-bench > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; padding: 12px; cursor: pointer; color: #e9c37e; font-weight: 800; font-size: 11px; }
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
        .dp-live-matchup-grid .dp-matchup-card { border-color:#3b4859; box-shadow:0 5px 20px rgba(0,0,0,.13); }
        .dp-live-matchup-grid .dp-matchup-versus { padding:22px 14px; background:#1b2532; }
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
        .dp-live-columns .dp-espn-actual { font-size:18px; color:#fff; }
        .dp-live-columns .dp-espn-projection { font-size:18px; }
        .dp-live-columns .dp-espn-projection small { font-size:10px; }
        @media(max-width:1050px) {
          .dp-live-columns { grid-template-columns:minmax(0,1fr); }
          .dp-live-columns>div+div { border-left:0; border-top:3px solid #39485a; }
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

        .dp-live-player {
          display: grid;
          grid-template-columns:
            36px minmax(0, 1fr) 50px;
          align-items: center;
          gap: 6px;
          padding: 10px 0;
          border-bottom:
            1px solid #29313d;
        }

        .dp-live-slot {
          color: #e9bd67;
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
          color: #f3f5f7;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .dp-live-player-name small {
          color: #8f9cac;
          font-size: 10px;
        }

        .dp-live-player > b {
          color: #f5f6f8;
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
      `}</style>
    </main>
  );
}
