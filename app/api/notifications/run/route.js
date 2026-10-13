import { NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPush } from "../../../../lib/push";
import { getLeagueData } from "../../../../lib/leagueData";
import { getMatchupIntel } from "../../../../lib/matchupIntel";
import { getEspnLiveScoreMap } from "../../../../lib/espnLiveScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NFL_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const NFL_SUMMARY =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

// =====================================================
// GENERAL HELPERS
// =====================================================

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const result = Number(value);

  return Number.isFinite(result) ? result : null;
}

function num(value) {
  return numberOrNull(value) ?? 0;
}

function score(value) {
  const valueNumber = numberOrNull(value);

  return valueNumber === null
    ? null
    : valueNumber.toFixed(2);
}

function firstName(name = "") {
  return (
    String(name || "").trim().split(" ")[0] ||
    "Owner"
  );
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function matchupKey(game) {
  const away = Number(game.away_owner_id);
  const home = Number(game.home_owner_id);

  return `${Math.min(away, home)}-${Math.max(away, home)}`;
}

function isFinal(game) {
  const winner = String(game?.winner || "")
    .toUpperCase();

  return (
    game?.completed === true ||
    game?.is_final === true ||
    String(game?.status || "").toUpperCase() ===
      "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(winner)
  );
}

// =====================================================
// SUPABASE NOTIFICATION STATE
//
// Used to prevent duplicate notifications.
// =====================================================

async function getState(stateKey) {
  const { data, error } = await supabaseAdmin
    .from("notification_state")
    .select("state_value")
    .eq("state_key", stateKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.state_value || null;
}

async function setState(stateKey, stateValue) {
  const { error } = await supabaseAdmin
    .from("notification_state")
    .upsert(
      {
        state_key: stateKey,
        state_value: stateValue,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "state_key",
      }
    );

  if (error) {
    throw error;
  }
}

// =====================================================
// PUSH SUBSCRIPTIONS
// =====================================================

async function loadSubscriptions() {
  const { data, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, owner_id, endpoint, p256dh, auth")
    .eq("enabled", true);

  if (error) {
    throw error;
  }

  const byOwner = new Map();

  for (const subscription of data || []) {
    const ownerId = Number(subscription.owner_id);

    if (!ownerId) {
      continue;
    }

    if (!byOwner.has(ownerId)) {
      byOwner.set(ownerId, []);
    }

    byOwner.get(ownerId).push(subscription);
  }

  return byOwner;
}

async function pushToOwner(
  subscriptionsByOwner,
  ownerId,
  payload
) {
  const subscriptions =
    subscriptionsByOwner.get(Number(ownerId)) || [];

  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await sendPush(subscription, payload);
      sent++;
    } catch (error) {
      console.error(
        "Push notification failed:",
        error
      );

      if (
        error?.statusCode === 404 ||
        error?.statusCode === 410
      ) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);
      }
    }
  }

  return sent;
}

// =====================================================
// ESPN HTTP
// =====================================================

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });

  if (!response.ok) {
    throw new Error(
      `ESPN request failed: ${response.status}`
    );
  }

  return response.json();
}

// =====================================================
// NFL EVENTS
// =====================================================

async function getNflEvents(season, week) {
  const url =
    `${NFL_SCOREBOARD}` +
    `?dates=${season}` +
    `&seasontype=2` +
    `&week=${week}` +
    `&limit=100`;

  const data = await getJson(url);

  return Array.isArray(data?.events)
    ? data.events
    : [];
}

function eventState(event) {
  return event?.status?.type?.state || "";
}

function eventDay(event) {
  if (!event?.date) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
    }).format(new Date(event.date));
  } catch {
    return "";
  }
}

// =====================================================
// NFL GAME SUMMARY
// =====================================================

async function getNflSummary(event, season, week) {
  const cacheKey =
    `nfl-summary:${season}:${week}:${event.id}`;

  if (eventState(event) === "post") {
    const cached = await getState(cacheKey);

    if (cached?.summary) {
      return cached.summary;
    }
  }

  const data = await getJson(
    `${NFL_SUMMARY}?event=${event.id}`
  );

  const compact = {
    scoringPlays: Array.isArray(data?.scoringPlays)
      ? data.scoringPlays
      : [],

    boxscore: {
      players: Array.isArray(data?.boxscore?.players)
        ? data.boxscore.players
        : [],
    },
  };

  if (eventState(event) === "post") {
    await setState(cacheKey, {
      summary: compact,
    });
  }

  return compact;
}

// =====================================================
// ESPN FANTASY POINTS PER PLAYER
// =====================================================

async function getFantasyPointsByTeam(season, week) {
  const leagueId =
    process.env.ESPN_LEAGUE_ID?.trim();

  const espnS2 =
    process.env.ESPN_S2?.trim();

  const espnSwid =
    process.env.ESPN_SWID?.trim();

  if (!leagueId) {
    return new Map();
  }

  const cookies = [];

  if (espnS2) {
    cookies.push(`espn_s2=${espnS2}`);
  }

  if (espnSwid) {
    cookies.push(`SWID=${espnSwid}`);
  }

  const url =
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/" +
    `seasons/${season}/segments/0/leagues/${leagueId}` +
    `?scoringPeriodId=${week}` +
    `&view=mRoster` +
    `&view=mTeam`;

  try {
    const data = await getJson(url, {
      headers: cookies.length
        ? {
            Cookie: cookies.join("; "),
          }
        : {},
    });

    const result = new Map();

    for (const team of data?.teams || []) {
      const playerMap = new Map();

      for (const entry of team?.roster?.entries || []) {
        const playerId = String(
          entry?.playerId ??
          entry?.playerPoolEntry?.id ??
          ""
        );

        if (!playerId) {
          continue;
        }

        const stats =
          entry?.playerPoolEntry?.player?.stats || [];

        const actualStat = stats.find(
          (stat) =>
            Number(stat?.scoringPeriodId) === week &&
            Number(stat?.statSourceId) === 0 &&
            (
              stat?.seasonId === undefined ||
              Number(stat.seasonId) === season
            )
        );

        const points = numberOrNull(
          actualStat?.appliedTotal ??
          entry?.playerPoolEntry?.appliedStatTotal
        );

        if (points !== null) {
          playerMap.set(playerId, points);
        }
      }

      result.set(Number(team.id), playerMap);
    }

    return result;
  } catch (error) {
    console.error(
      "Fantasy points lookup failed:",
      error
    );

    return new Map();
  }
}

// =====================================================
// LIVE FANTASY MATCHUP SCORES
//
// FIX:
//
// Do not use Supabase game.away_score or
// game.home_score for live notifications.
//
// Those values may be stale or missing.
//
// Use ESPN live team totals directly.
// =====================================================

async function getLiveFantasyScores(season, week) {
  try {
    return await getEspnLiveScoreMap(
      season,
      week
    );
  } catch (error) {
    console.error(
      "Unable to load live fantasy scores:",
      error
    );

    return new Map();
  }
}

// =====================================================
// FORMAT A FANTASY MATCHUP SCORE
//
// If either score is missing, omit the
// entire score line.
//
// A genuine 0.00 is allowed when ESPN
// explicitly reports it.
//
// We never convert missing values to zero.
// =====================================================

function formatLiveMatchupScore({
  awayId,
  homeId,
  ownerId,
  ownerMap,
  teamByOwner,
  liveScores,
}) {
  const awayTeam = teamByOwner.get(awayId);
  const homeTeam = teamByOwner.get(homeId);

  const awayEspnId = Number(
    awayTeam?.espnTeamId ??
    awayTeam?.espn_team_id ??
    awayTeam?.id ??
    0
  );

  const homeEspnId = Number(
    homeTeam?.espnTeamId ??
    homeTeam?.espn_team_id ??
    homeTeam?.id ??
    0
  );

  if (!awayEspnId || !homeEspnId) {
    return null;
  }

  const awayLive = liveScores.get(awayEspnId);
  const homeLive = liveScores.get(homeEspnId);

  if (!awayLive || !homeLive) {
    return null;
  }

  const awayScore = numberOrNull(
    awayLive.currentPoints
  );

  const homeScore = numberOrNull(
    homeLive.currentPoints
  );

  if (
    awayScore === null ||
    homeScore === null
  ) {
    return null;
  }

  const awayName = firstName(
    ownerMap.get(awayId)
  );

  const homeName = firstName(
    ownerMap.get(homeId)
  );

  // Show the receiving owner first.

  if (Number(ownerId) === Number(homeId)) {
    return (
      `${homeName} ${score(homeScore)} · ` +
      `${awayName} ${score(awayScore)}`
    );
  }

  return (
    `${awayName} ${score(awayScore)} · ` +
    `${homeName} ${score(homeScore)}`
  );
}

// =====================================================
// NFL TOUCHDOWN PLAYS
// =====================================================

function scoringPlaysFromSummary(summary, eventId) {
  const plays = Array.isArray(summary?.scoringPlays)
    ? summary.scoringPlays
    : [];

  return plays
    .filter((play) => {
      const type = String(
        play?.type?.text || ""
      ).toLowerCase();

      const text = String(
        play?.text ||
        play?.shortText ||
        ""
      ).toLowerCase();

      return (
        type.includes("touchdown") ||
        text.includes("touchdown")
      );
    })
    .map((play, index) => {
      const participants = Array.isArray(
        play?.participants
      )
        ? play.participants
        : [];

      const participantIds = participants
        .map((participant) =>
          String(
            participant?.athlete?.id ??
            participant?.id ??
            ""
          )
        )
        .filter(Boolean);

      return {
        key: `${eventId}:${play?.id || index}`,
        eventId,

        text:
          play?.text ||
          play?.shortText ||
          "Touchdown",

        participantIds,
      };
    });
}

// =====================================================
// DETERMINE WHETHER A STARTER SCORED
// =====================================================

function starterMatchesPlay(starter, play) {
  const playerId = String(
    starter?.playerId ??
    starter?.id ??
    ""
  );

  if (
    playerId &&
    play.participantIds.includes(playerId)
  ) {
    return true;
  }

  const fullName = normalize(starter?.name);

  if (!fullName) {
    return false;
  }

  const playText = normalize(play.text);

  if (playText.includes(fullName)) {
    return true;
  }

  const pieces = String(starter?.name || "")
    .trim()
    .split(/\s+/);

  if (pieces.length < 2) {
    return false;
  }

  const lastName = normalize(
    pieces[pieces.length - 1]
  );

  return (
    lastName.length >= 4 &&
    playText.includes(lastName)
  );
}

// =====================================================
// PLAYER BOX SCORE MATCHING
// =====================================================

function athleteMatchesStarter(athlete, starter) {
  const athleteId = String(
    athlete?.id || ""
  );

  const starterId = String(
    starter?.playerId ??
    starter?.id ??
    ""
  );

  if (
    athleteId &&
    starterId &&
    athleteId === starterId
  ) {
    return true;
  }

  const athleteName = normalize(
    athlete?.displayName ||
    athlete?.fullName ||
    athlete?.shortName
  );

  const starterName = normalize(
    starter?.name
  );

  return Boolean(
    athleteName &&
    starterName &&
    (
      athleteName === starterName ||
      athleteName.includes(starterName) ||
      starterName.includes(athleteName)
    )
  );
}

// =====================================================
// EXTRACT PLAYER BOX SCORE STATS
// =====================================================

function extractPlayerBoxStats(summary, starter) {
  const result = {};

  for (
    const teamBlock of
    summary?.boxscore?.players || []
  ) {
    for (
      const category of
      teamBlock?.statistics || []
    ) {
      const categoryName = String(
        category?.name ||
        category?.displayName ||
        ""
      ).toLowerCase();

      const labels =
        category?.labels ||
        category?.names ||
        [];

      for (const row of category?.athletes || []) {
        if (
          !athleteMatchesStarter(
            row?.athlete || {},
            starter
          )
        ) {
          continue;
        }

        if (!result[categoryName]) {
          result[categoryName] = {};
        }

        const values = row?.stats || [];

        for (
          let index = 0;
          index < Math.max(
            labels.length,
            values.length
          );
          index++
        ) {
          const label =
            labels[index] ||
            `STAT${index}`;

          result[categoryName][label] =
            values[index];
        }
      }
    }
  }

  return result;
}

function findPlayerBoxStats(starter, summaries) {
  for (const summary of summaries) {
    const stats = extractPlayerBoxStats(
      summary,
      starter
    );

    if (Object.keys(stats).length) {
      return stats;
    }
  }

  return {};
}

// =====================================================
// FORMAT PLAYER STAT LINE
// =====================================================

function normalizeStatKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getStat(category, aliases) {
  const wanted = aliases.map(normalizeStatKey);

  for (
    const [key, value] of
    Object.entries(category || {})
  ) {
    if (
      wanted.includes(normalizeStatKey(key))
    ) {
      return value;
    }
  }

  return null;
}

function findCategory(stats, part) {
  const name = Object.keys(stats || {})
    .find((key) => key.includes(part));

  return name ? stats[name] : {};
}

function addStat(parts, value, label, positiveOnly = false) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return;
  }

  if (
    positiveOnly &&
    num(value) <= 0
  ) {
    return;
  }

  parts.push(`${value} ${label}`);
}

function buildPlayerStatLine(starter, boxStats) {
  const position = String(
    starter?.position || ""
  ).toUpperCase();

  const passing = findCategory(boxStats, "pass");
  const rushing = findCategory(boxStats, "rush");
  const receiving = findCategory(boxStats, "receiv");
  const fumbles = findCategory(boxStats, "fum");
  const kicking = findCategory(boxStats, "kick");

  const passYds = getStat(passing, ["YDS"]);
  const passTd = getStat(passing, ["TD"]);
  const interceptions = getStat(passing, ["INT"]);
  const compAtt = getStat(passing, [
    "C/ATT",
    "CMP/ATT",
    "COMP/ATT",
  ]);

  const carries = getStat(rushing, [
    "CAR",
    "ATT",
  ]);

  const rushYds = getStat(rushing, ["YDS"]);
  const rushTd = getStat(rushing, ["TD"]);

  const receptions = getStat(receiving, [
    "REC",
  ]);

  const recYds = getStat(receiving, ["YDS"]);

  const targets = getStat(receiving, [
    "TGTS",
    "TGT",
  ]);

  const recTd = getStat(receiving, ["TD"]);

  const parts = [];

  if (position === "QB") {
    addStat(parts, compAtt, "CMP/ATT");
    addStat(parts, passYds, "PASS YDS");
    addStat(parts, passTd, "PASS TD", true);
    addStat(parts, interceptions, "INT", true);
    addStat(parts, carries, "CAR", true);

    if (num(carries) > 0) {
      addStat(parts, rushYds, "RUSH YDS");
    }

    addStat(parts, rushTd, "RUSH TD", true);
  } else if (position === "RB") {
    addStat(parts, carries, "CAR");
    addStat(parts, rushYds, "RUSH YDS");
    addStat(parts, rushTd, "RUSH TD", true);
    addStat(parts, receptions, "REC");
    addStat(parts, recYds, "REC YDS");
    addStat(parts, targets, "TGTS");
    addStat(parts, recTd, "REC TD", true);
  } else if (
    position === "WR" ||
    position === "TE"
  ) {
    addStat(parts, receptions, "REC");
    addStat(parts, recYds, "REC YDS");
    addStat(parts, targets, "TGTS");
    addStat(parts, recTd, "REC TD", true);

    if (num(carries) > 0) {
      addStat(parts, carries, "CAR");
      addStat(parts, rushYds, "RUSH YDS");
    }

    addStat(parts, rushTd, "RUSH TD", true);
  } else if (position === "K") {
    addStat(
      parts,
      getStat(kicking, [
        "FG",
        "FGM/A",
        "FGM/FGA",
      ]),
      "FG"
    );

    addStat(
      parts,
      getStat(kicking, [
        "XP",
        "XPM/A",
        "XPM/XPA",
      ]),
      "XP"
    );

    addStat(
      parts,
      getStat(kicking, [
        "LONG",
        "LNG",
      ]),
      "LONG"
    );
  } else {
    addStat(parts, carries, "CAR", true);
    addStat(parts, rushYds, "RUSH YDS", true);
    addStat(parts, rushTd, "RUSH TD", true);
    addStat(parts, receptions, "REC", true);
    addStat(parts, recYds, "REC YDS", true);
    addStat(parts, recTd, "REC TD", true);
  }

  const fumblesLost = getStat(fumbles, [
    "LOST",
    "FUMLOST",
    "FUMBLESLOST",
  ]);

  addStat(
    parts,
    fumblesLost,
    "FUM LOST",
    true
  );

  return parts.join(" · ");
}

// =====================================================
// MAIN NOTIFICATION RUNNER
// =====================================================

async function runNotifications() {
  const league = await getLeagueData();

  const season = Number(
    league.currentSeason
  );

  const week = Number(
    league.currentWeek
  );

  const owners = league.owners || [];
  const teams = league.currentTeams || [];

  const matchups = (
    league.currentSeasonMatchups || []
  ).filter(
    (game) =>
      Number(game.matchup_period) === week
  );

  if (!matchups.length) {
    return {
      ok: true,
      message: "No current matchups.",
    };
  }

  const ownerMap = new Map(
    owners.map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const teamByOwner = new Map();

  for (const team of teams) {
    const ownerId = Number(
      team.owner_id ??
      team.ownerId ??
      0
    );

    if (ownerId) {
      teamByOwner.set(ownerId, team);
    }
  }

  const subscriptions =
    await loadSubscriptions();

  let pushesSent = 0;

  // ===================================================
  // MATCHUP INTEL
  // ===================================================

  let intel = null;

  try {
    intel = await getMatchupIntel(week);
  } catch (error) {
    console.error(
      "Matchup intel error:",
      error
    );
  }

  function ownerIntel(ownerId) {
    const team = teamByOwner.get(
      Number(ownerId)
    );

    if (!team || !intel) {
      return null;
    }

    const espnTeamId = Number(
      team.espnTeamId ??
      team.espn_team_id ??
      team.id ??
      0
    );

    return (
      intel?.teamMap?.get(espnTeamId) ||
      null
    );
  }

  function espnTeamIdForOwner(ownerId) {
    const team = teamByOwner.get(
      Number(ownerId)
    );

    return Number(
      team?.espnTeamId ??
      team?.espn_team_id ??
      team?.id ??
      0
    );
  }

  function matchupScore(game, ownerId) {
    return formatLiveMatchupScore({
      awayId: Number(game.away_owner_id),
      homeId: Number(game.home_owner_id),
      ownerId,
      ownerMap,
      teamByOwner,
      liveScores,
    });
  }

  // ===================================================
  // LOAD LIVE ESPN FANTASY SCORES
  //
  // FIX: This is our source for live scores.
  // ===================================================

  const liveScores = await getLiveFantasyScores(
    season,
    week
  );

  // ===================================================
  // LOAD NFL EVENTS
  // ===================================================

  const nflEvents = await getNflEvents(
    season,
    week
  );

  const summaries = [];
  const summaryByEvent = new Map();

  for (const event of nflEvents) {
    if (eventState(event) === "pre") {
      continue;
    }

    try {
      const summary = await getNflSummary(
        event,
        season,
        week
      );

      summaries.push(summary);

      summaryByEvent.set(
        String(event.id),
        summary
      );
    } catch (error) {
      console.error(
        "NFL summary error:",
        event.id,
        error
      );
    }
  }

  const fantasyPoints = await getFantasyPointsByTeam(
    season,
    week
  );

  // ===================================================
  // MATCHUP START NOTIFICATIONS
  // ===================================================

  for (const game of matchups) {
    const awayId = Number(
      game.away_owner_id
    );

    const homeId = Number(
      game.home_owner_id
    );

    const awayName =
      ownerMap.get(awayId) || "Away";

    const homeName =
      ownerMap.get(homeId) || "Home";

    const starters = [
      ...(ownerIntel(awayId)?.starters || []),
      ...(ownerIntel(homeId)?.starters || []),
    ];

    const started = starters.some(
      (player) =>
        player?.nflGameState === "in" ||
        player?.nflGameState === "post"
    );

    if (!started) {
      continue;
    }

    const key =
      `start:${season}:${week}:${matchupKey(game)}`;

    if (await getState(key)) {
      continue;
    }

    const awayScoreText = matchupScore(
      game,
      awayId
    );

    const homeScoreText = matchupScore(
      game,
      homeId
    );

    const awayBody =
      `Your Week ${week} matchup vs ` +
      `${firstName(homeName)} is underway.` +
      (awayScoreText
        ? ` ${awayScoreText}`
        : "");

    const homeBody =
      `Your Week ${week} matchup vs ` +
      `${firstName(awayName)} is underway.` +
      (homeScoreText
        ? ` ${homeScoreText}`
        : "");

    pushesSent += await pushToOwner(
      subscriptions,
      awayId,
      {
        title: "🏈 MATCHUP START",
        body: awayBody,
        tag: key,
        url: "/",
      }
    );

    pushesSent += await pushToOwner(
      subscriptions,
      homeId,
      {
        title: "🏈 MATCHUP START",
        body: homeBody,
        tag: key,
        url: "/",
      }
    );

    await setState(key, {
      sent: true,
    });
  }

  // ===================================================
  // TOUCHDOWN NOTIFICATIONS
  //
  // FIX:
  //
  // Previously used game.away_score and
  // game.home_score.
  //
  // Now uses live ESPN fantasy totals.
  //
  // If scores are unavailable, the touchdown
  // alert still sends without a fake score.
  // ===================================================

  const touchdownPlays = [];

  for (const event of nflEvents) {
    const summary = summaryByEvent.get(
      String(event.id)
    );

    if (!summary) {
      continue;
    }

    touchdownPlays.push(
      ...scoringPlaysFromSummary(
        summary,
        event.id
      )
    );
  }

  const tdStateKey =
    `td-seen:${season}:${week}`;

  const oldTdState = await getState(
    tdStateKey
  );

  const currentKeys = touchdownPlays.map(
    (play) => play.key
  );

  if (!oldTdState) {
    // First run establishes a baseline.
    // Prevents old touchdowns being sent
    // immediately after deploying.

    await setState(tdStateKey, {
      seen: currentKeys,
    });
  } else {
    const seen = new Set(
      oldTdState.seen || []
    );

    const newPlays = touchdownPlays.filter(
      (play) => !seen.has(play.key)
    );

    for (const play of newPlays) {
      for (const game of matchups) {
        const awayId = Number(
          game.away_owner_id
        );

        const homeId = Number(
          game.home_owner_id
        );

        for (const ownerId of [
          awayId,
          homeId,
        ]) {
          const starters =
            ownerIntel(ownerId)?.starters || [];

          const matched = starters.filter(
            (starter) =>
              starterMatchesPlay(
                starter,
                play
              )
          );

          if (!matched.length) {
            continue;
          }

          const names = [
            ...new Set(
              matched.map(
                (player) => player.name
              )
            ),
          ];

          const scoreText = matchupScore(
            game,
            ownerId
          );

          // Include the scoring play.
          // Do not substitute stale 0-0 scores.

          const body = [
            play.text,
            scoreText,
          ]
            .filter(Boolean)
            .join("\n");

          pushesSent += await pushToOwner(
            subscriptions,
            ownerId,
            {
              title:
                `🔥 TOUCHDOWN — ${names.join(" + ")}`,

              body,

              tag:
                `td:${play.key}:${ownerId}`,

              url: "/",
            }
          );
        }
      }

      seen.add(play.key);
    }

    await setState(tdStateKey, {
      seen: [...seen].slice(-250),
    });
  }

  // ===================================================
  // PLAYER FINAL NOTIFICATIONS
  // ===================================================

  const playerBaselineKey =
    `player-final-baseline:${season}:${week}`;

  const playerBaseline = await getState(
    playerBaselineKey
  );

  if (!playerBaseline) {
    // Establish baseline for players who
    // were already final before deployment.

    for (const game of matchups) {
      for (const ownerId of [
        Number(game.away_owner_id),
        Number(game.home_owner_id),
      ]) {
        const starters =
          ownerIntel(ownerId)?.starters || [];

        for (const player of starters) {
          if (
            player?.nflGameState !== "post"
          ) {
            continue;
          }

          const playerId = String(
            player?.playerId ||
            player?.id ||
            normalize(player?.name)
          );

          if (!playerId) {
            continue;
          }

          await setState(
            `player-final:${season}:${week}:${ownerId}:${playerId}`,
            {
              baseline: true,
            }
          );
        }
      }
    }

    await setState(playerBaselineKey, {
      initialized: true,
    });
  } else {
    for (const game of matchups) {
      for (const ownerId of [
        Number(game.away_owner_id),
        Number(game.home_owner_id),
      ]) {
        const starters =
          ownerIntel(ownerId)?.starters || [];

        const fantasyTeamId =
          espnTeamIdForOwner(ownerId);

        const teamPoints =
          fantasyPoints.get(fantasyTeamId) ||
          new Map();

        for (const player of starters) {
          if (
            player?.nflGameState !== "post"
          ) {
            continue;
          }

          const playerId = String(
            player?.playerId ||
            player?.id ||
            normalize(player?.name)
          );

          if (!playerId) {
            continue;
          }

          const stateKey =
            `player-final:${season}:${week}:${ownerId}:${playerId}`;

          if (await getState(stateKey)) {
            continue;
          }

          const actualPoints = teamPoints.has(
            playerId
          )
            ? teamPoints.get(playerId)
            : null;

          const projection = numberOrNull(
            player?.projection
          );

          const boxStats = findPlayerBoxStats(
            player,
            summaries
          );

          const statLine = buildPlayerStatLine(
            player,
            boxStats
          );

          let body =
            player?.name ||
            "Your starter";

          if (actualPoints !== null) {
            body +=
              ` — ${actualPoints.toFixed(1)} fantasy pts`;
          }

          if (
            projection !== null &&
            projection > 0
          ) {
            if (actualPoints !== null) {
              const difference =
                actualPoints - projection;

              body +=
                ` · ${difference >= 0 ? "+" : ""}` +
                `${difference.toFixed(1)} vs proj`;
            } else {
              body +=
                ` · ${projection.toFixed(1)} projected`;
            }
          }

          if (statLine) {
            body += `\n${statLine}`;
          }

          pushesSent += await pushToOwner(
            subscriptions,
            ownerId,
            {
              title: "📊 PLAYER FINAL",
              body,
              tag: stateKey,
              url: "/",
            }
          );

          await setState(stateKey, {
            sent: true,
            player: player?.name || null,
            points: actualPoints,
            stats: statLine || null,
          });
        }
      }
    }
  }

  // ===================================================
  // LEAD CHANGE NOTIFICATIONS
  //
  // Only after both teams score 50 points.
  //
  // Use live ESPN totals rather than
  // potentially stale database scores.
  // ===================================================

  for (const game of matchups) {
    const awayId = Number(
      game.away_owner_id
    );

    const homeId = Number(
      game.home_owner_id
    );

    const awayTeamId =
      espnTeamIdForOwner(awayId);

    const homeTeamId =
      espnTeamIdForOwner(homeId);

    const awayScore = numberOrNull(
      liveScores.get(awayTeamId)?.currentPoints
    );

    const homeScore = numberOrNull(
      liveScores.get(homeTeamId)?.currentPoints
    );

    if (
      awayScore === null ||
      homeScore === null ||
      awayScore < 50 ||
      homeScore < 50
    ) {
      continue;
    }

    const stateKey =
      `leader:${season}:${week}:${matchupKey(game)}`;

    const currentLeader =
      awayScore > homeScore
        ? awayId
        : homeScore > awayScore
        ? homeId
        : null;

    const oldState = await getState(
      stateKey
    );

    if (!oldState) {
      await setState(stateKey, {
        leader: currentLeader,
      });

      continue;
    }

    const oldLeader = oldState.leader
      ? Number(oldState.leader)
      : null;

    if (
      currentLeader &&
      oldLeader &&
      currentLeader !== oldLeader
    ) {
      const leaderName =
        ownerMap.get(currentLeader) ||
        "A team";

      const scoreText = matchupScore(
        game,
        currentLeader
      );

      const body =
        `${firstName(leaderName)} takes the lead.` +
        (scoreText ? ` ${scoreText}` : "");

      const tag =
        `lead:${season}:${week}:` +
        `${matchupKey(game)}:${currentLeader}`;

      pushesSent += await pushToOwner(
        subscriptions,
        awayId,
        {
          title: "🔄 LEAD CHANGE",
          body,
          tag,
          url: "/",
        }
      );

      pushesSent += await pushToOwner(
        subscriptions,
        homeId,
        {
          title: "🔄 LEAD CHANGE",
          body,
          tag,
          url: "/",
        }
      );
    }

    await setState(stateKey, {
      leader: currentLeader,
    });
  }

  // ===================================================
  // THURSDAY + SUNDAY UPDATES
  // ===================================================

  const dayGroups = [
    {
      day: "Thursday",
      title: "🏈 THURSDAY UPDATE",
      slug: "thursday",
    },
    {
      day: "Sunday",
      title: "🏈 SUNDAY UPDATE",
      slug: "sunday",
    },
  ];

  for (const group of dayGroups) {
    const dayEvents = nflEvents.filter(
      (event) =>
        eventDay(event) === group.day
    );

    if (!dayEvents.length) {
      continue;
    }

    const complete = dayEvents.every(
      (event) =>
        eventState(event) === "post"
    );

    if (!complete) {
      continue;
    }

    for (const game of matchups) {
      const awayId = Number(
        game.away_owner_id
      );

      const homeId = Number(
        game.home_owner_id
      );

      const stateKey =
        `${group.slug}:${season}:${week}:` +
        `${matchupKey(game)}`;

      if (await getState(stateKey)) {
        continue;
      }

      // ESPN may be delayed. Do not invent
      // a score for these updates.

      const scoreText = matchupScore(
        game,
        awayId
      );

      const body =
        scoreText ||
        `Week ${week} fantasy matchup update.`;

      pushesSent += await pushToOwner(
        subscriptions,
        awayId,
        {
          title: group.title,
          body,
          tag: stateKey,
          url: "/",
        }
      );

      pushesSent += await pushToOwner(
        subscriptions,
        homeId,
        {
          title: group.title,
          body,
          tag: stateKey,
          url: "/",
        }
      );

      await setState(stateKey, {
        sent: true,
      });
    }
  }

  // ===================================================
  // FANTASY MATCHUP FINAL
  // ===================================================

  for (const game of matchups) {
    if (!isFinal(game)) {
      continue;
    }

    const awayId = Number(
      game.away_owner_id
    );

    const homeId = Number(
      game.home_owner_id
    );

    const awayName =
      ownerMap.get(awayId) ||
      "Away";

    const homeName =
      ownerMap.get(homeId) ||
      "Home";

    const stateKey =
      `final:${season}:${week}:` +
      `${matchupKey(game)}`;

    if (await getState(stateKey)) {
      continue;
    }

    // Final scores can come from the
    // completed matchup record.

    const awayScore = numberOrNull(
      game.away_score
    );

    const homeScore = numberOrNull(
      game.home_score
    );

    if (
      awayScore === null ||
      homeScore === null
    ) {
      continue;
    }

    let body;

    if (awayScore === homeScore) {
      body =
        `${firstName(awayName)} ${score(awayScore)} · ` +
        `${firstName(homeName)} ${score(homeScore)}`;
    } else {
      const awayWon =
        awayScore > homeScore;

      const winnerName =
        awayWon ? awayName : homeName;

      const loserName =
        awayWon ? homeName : awayName;

      const winnerScore =
        Math.max(awayScore, homeScore);

      const loserScore =
        Math.min(awayScore, homeScore);

      body =
        `${firstName(winnerName)} defeats ` +
        `${firstName(loserName)} · ` +
        `${score(winnerScore)} – ` +
        `${score(loserScore)}`;
    }

    pushesSent += await pushToOwner(
      subscriptions,
      awayId,
      {
        title: "🏆 FINAL",
        body,
        tag: stateKey,
        url: "/",
      }
    );

    pushesSent += await pushToOwner(
      subscriptions,
      homeId,
      {
        title: "🏆 FINAL",
        body,
        tag: stateKey,
        url: "/",
      }
    );

    await setState(stateKey, {
      sent: true,
    });
  }

  // ===================================================
  // RESULT
  // ===================================================

  return {
    ok: true,
    season,
    week,
    matchups: matchups.length,
    pushesSent,
  };
}

// =====================================================
// API ROUTES
// =====================================================

export async function GET() {
  try {
    const result =
      await runNotifications();

    return NextResponse.json(
      result
    );
  } catch (error) {
    console.error(
      "Notification runner error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Notification runner failed.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST() {
  return GET();
}
