// NFL game details from ESPN's public scoreboard, keyed by NFL team abbreviation.
// Fantasy and NFL weeks line up during the NFL regular season.
export function canonicalNflTeam(value) {
  const code = String(value || "").toUpperCase();
  return ({ WSH: "WAS", JAC: "JAX", LA: "LAR" })[code] || code;
}

function kickoffCT(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

export async function getNflGameMap(season, week) {
  const results = new Map();
  const params = new URLSearchParams({
    dates: String(season),
    seasontype: "2",
    week: String(week),
    limit: "100",
  });

  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${params}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`NFL scoreboard returned ${response.status}`);

    const data = await response.json();
    for (const event of data.events || []) {
      const competition = event.competitions?.[0];
      const sides = competition?.competitors || [];
      if (sides.length !== 2) continue;

      const status = competition.status || event.status || {};
      const rawNetworks = [
        ...(competition.broadcasts || []).flatMap(b => [b.names, b.name].flat().filter(Boolean)),
        ...(event.broadcasts || []).flatMap(b => [b.names, b.name].flat().filter(Boolean)),
        competition?.geoBroadcasts?.[0]?.media?.shortName,
        ...(competition.geoBroadcasts || []).map(b => b?.media?.shortName).filter(Boolean)
      ].filter(Boolean);
      const networks = [...new Set(rawNetworks.map(String))];
      const network = networks.join(", ") || null;
      const eventUrl = "https://www.espn.com/nfl/game/_/gameId/" + encodeURIComponent(String(event.id || ""));
      const watchUrl = event?.links?.find(l => /watch/i.test(String(l.text || l.shortText || "")))?.href || null;
      const type = status.type || {};
      const state = type.state || "pre";
      const period = Number(status.period || 0);
      const clock = status.displayClock || "";
      let gameStatus;
      if (state === "post") {
        gameStatus = "FINAL";
      } else if (state === "in") {
        if (/halftime/i.test(type.description || type.shortDetail || "")) {
          gameStatus = "HALFTIME";
        } else if (period > 4) {
          gameStatus = clock && clock !== "0:00" ? `OT · ${clock}` : "OT";
        } else {
          gameStatus = `Q${period || 1}${clock ? ` · ${clock}` : ""}`;
        }
      } else {
        gameStatus = kickoffCT(event.date || competition.date) || "Scheduled";
      }

      const home = sides.find(side => side.homeAway === "home");
      const away = sides.find(side => side.homeAway === "away");
      if (!home || !away) continue;
      const code = side => canonicalNflTeam(side.team?.abbreviation || side.team?.shortDisplayName);
      const homeCode = code(home), awayCode = code(away);
      if (!homeCode || !awayCode) continue;

      const scoreOf = side =>
        side.score == null || side.score === "" ? null : Number(side.score);

      results.set(homeCode, {
        eventId: String(event.id || ""),
        opponent: awayCode,
        isHome: true,
        ownScore: state === "pre" ? null : scoreOf(home),
        opponentScore: state === "pre" ? null : scoreOf(away),
        status: gameStatus,
        state,
        network,
        eventUrl,
        watchUrl,
        kickoff: event.date || competition.date || null
      });
      results.set(awayCode, {
        eventId: String(event.id || ""),
        opponent: homeCode,
        isHome: false,
        ownScore: state === "pre" ? null : scoreOf(away),
        opponentScore: state === "pre" ? null : scoreOf(home),
        status: gameStatus,
        state,
        network,
        eventUrl,
        watchUrl,
        kickoff: event.date || competition.date || null
      });
    }
  } catch (error) {
    console.error("NFL scoreboard information unavailable:", error);
  }
  return Object.fromEntries(results);
}

// Match ESPN's live game windows and wake up at the next scheduled kickoff.
export function getScoreboardRefresh(games, now = Date.now()) {
  const schedule = Object.values(games);
  if (schedule.some(game => game.state === "in")) return { intervalMs: 30000 };

  const kickoff = Math.min(...schedule
    .filter(game => game.state === "pre")
    .map(game => Date.parse(game.kickoff))
    .filter(time => Number.isFinite(time) && time > now));

  return { intervalMs: 300000, nextKickoff: Number.isFinite(kickoff) ? kickoff : null };
}
