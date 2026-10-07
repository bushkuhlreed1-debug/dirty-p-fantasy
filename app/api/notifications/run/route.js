import { NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPush } from "../../../../lib/push";
import { getLeagueData } from "../../../../lib/leagueData";
import { getMatchupIntel } from "../../../../lib/matchupIntel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NFL_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

const NFL_SUMMARY =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";


// =========================================================
// BASIC HELPERS
// =========================================================

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function score(value) {
  return num(value).toFixed(2);
}

function firstName(name = "") {
  return String(name).trim().split(" ")[0] || name;
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStatKey(value = "") {
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function matchupKey(game) {
  const away = Number(game.away_owner_id);
  const home = Number(game.home_owner_id);

  return `${Math.min(away, home)}-${Math.max(away, home)}`;
}


// =========================================================
// NOTIFICATION STATE
// =========================================================

async function getState(stateKey) {
  const { data, error } =
    await supabaseAdmin
      .from("notification_state")
      .select("state_value")
      .eq("state_key", stateKey)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.state_value || null;
}

async function setState(
  stateKey,
  stateValue
) {
  const { error } =
    await supabaseAdmin
      .from("notification_state")
      .upsert(
        {
          state_key: stateKey,
          state_value: stateValue,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "state_key",
        }
      );

  if (error) {
    throw error;
  }
}


// =========================================================
// PUSH SUBSCRIPTIONS
// =========================================================

async function loadSubscriptions() {
  const { data, error } =
    await supabaseAdmin
      .from("push_subscriptions")
      .select(
        "id, owner_id, endpoint, p256dh, auth"
      )
      .eq("enabled", true);

  if (error) {
    throw error;
  }

  const byOwner = new Map();

  for (const subscription of data || []) {
    const ownerId =
      Number(subscription.owner_id);

    if (!ownerId) {
      continue;
    }

    if (!byOwner.has(ownerId)) {
      byOwner.set(ownerId, []);
    }

    byOwner
      .get(ownerId)
      .push(subscription);
  }

  return byOwner;
}

async function pushToOwner(
  subscriptionsByOwner,
  ownerId,
  payload
) {
  const subscriptions =
    subscriptionsByOwner.get(
      Number(ownerId)
    ) || [];

  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await sendPush(
        subscription,
        payload
      );

      sent += 1;
    } catch (error) {
      console.error(
        "Push failed:",
        error
      );

      if (
        error?.statusCode === 404 ||
        error?.statusCode === 410
      ) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq(
            "id",
            subscription.id
          );
      }
    }
  }

  return sent;
}


// =========================================================
// ESPN HTTP
// =========================================================

async function getJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        cache: "no-store",
        ...options,
      }
    );

  if (!response.ok) {
    throw new Error(
      `ESPN request failed: ${response.status}`
    );
  }

  return response.json();
}


// =========================================================
// NFL EVENTS
// =========================================================

async function getNflEvents(
  season,
  week
) {
  const url =
    `${NFL_SCOREBOARD}` +
    `?dates=${season}` +
    `&seasontype=2` +
    `&week=${week}` +
    `&limit=100`;

  const data =
    await getJson(url);

  return Array.isArray(data?.events)
    ? data.events
    : [];
}

function eventState(event) {
  return (
    event?.status?.type?.state ||
    ""
  );
}

function eventDay(event) {
  if (!event?.date) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Chicago",
        weekday: "long",
      }
    ).format(
      new Date(event.date)
    );
  } catch {
    return "";
  }
}


// =========================================================
// NFL SUMMARY
// =========================================================

async function getNflSummary(
  event,
  season,
  week
) {
  const state =
    eventState(event);

  const cacheKey =
    `nfl-summary:${season}:${week}:${event.id}`;

  // Once a game is final, its stats no longer
  // need to be downloaded every minute.
  if (state === "post") {
    const cached =
      await getState(cacheKey);

    if (cached?.summary) {
      return cached.summary;
    }
  }

  const data =
    await getJson(
      `${NFL_SUMMARY}?event=${event.id}`
    );

  const compact = {
    scoringPlays:
      Array.isArray(
        data?.scoringPlays
      )
        ? data.scoringPlays
        : [],

    boxscore: {
      players:
        Array.isArray(
          data?.boxscore?.players
        )
          ? data.boxscore.players
          : [],
    },
  };

  if (state === "post") {
    await setState(
      cacheKey,
      {
        summary: compact,
      }
    );
  }

  return compact;
}


// =========================================================
// ESPN FANTASY POINTS
// =========================================================

async function getFantasyPointsByTeam(
  season,
  week
) {
  const leagueId =
    process.env.ESPN_LEAGUE_ID;

  const espnS2 =
    process.env.ESPN_S2;

  const espnSwid =
    process.env.ESPN_SWID;

  if (!leagueId) {
    return new Map();
  }

  const cookies = [];

  if (espnS2) {
    cookies.push(
      `espn_s2=${espnS2}`
    );
  }

  if (espnSwid) {
    cookies.push(
      `SWID=${espnSwid}`
    );
  }

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/` +
    `seasons/${season}/segments/0/leagues/${leagueId}` +
    `?scoringPeriodId=${week}` +
    `&view=mRoster` +
    `&view=mTeam`;

  try {
    const data =
      await getJson(
        url,
        {
          headers:
            cookies.length
              ? {
                  Cookie:
                    cookies.join("; "),
                }
              : {},
        }
      );

    const result =
      new Map();

    for (const team of data?.teams || []) {
      const playerMap =
        new Map();

      for (
        const entry of
        team?.roster?.entries || []
      ) {
        const playerId =
          String(
            entry?.playerId ||
            entry
              ?.playerPoolEntry
              ?.id ||
            ""
          );

        if (!playerId) {
          continue;
        }

        let points =
          entry
            ?.playerPoolEntry
            ?.appliedStatTotal;

        if (
          points === null ||
          points === undefined
        ) {
          const stats =
            entry
              ?.playerPoolEntry
              ?.player
              ?.stats ||
            [];

          const weekStat =
            stats.find(
              (stat) =>
                Number(
                  stat?.seasonId
                ) ===
                  Number(season) &&
                Number(
                  stat?.scoringPeriodId
                ) ===
                  Number(week) &&
                Number(
                  stat?.statSourceId
                ) === 0
            );

          points =
            weekStat?.appliedTotal;
        }

        if (
          points !== null &&
          points !== undefined &&
          Number.isFinite(
            Number(points)
          )
        ) {
          playerMap.set(
            playerId,
            Number(points)
          );
        }
      }

      result.set(
        Number(team.id),
        playerMap
      );
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


// =========================================================
// TOUCHDOWN HELPERS
// =========================================================

function scoringPlaysFromSummary(
  summary,
  eventId
) {
  const plays =
    Array.isArray(
      summary?.scoringPlays
    )
      ? summary.scoringPlays
      : [];

  return plays
    .filter(
      (play) => {
        const type =
          String(
            play?.type?.text ||
            ""
          ).toLowerCase();

        const text =
          String(
            play?.text ||
            play?.shortText ||
            ""
          ).toLowerCase();

        return (
          type.includes(
            "touchdown"
          ) ||
          text.includes(
            "touchdown"
          )
        );
      }
    )
    .map(
      (
        play,
        index
      ) => {
        const participants =
          Array.isArray(
            play?.participants
          )
            ? play.participants
            : [];

        const ids =
          participants
            .map(
              (participant) =>
                String(
                  participant
                    ?.athlete
                    ?.id ||
                  participant
                    ?.id ||
                  ""
                )
            )
            .filter(Boolean);

        return {
          key:
            `${eventId}:${
              play?.id ||
              index
            }`,

          eventId,

          text:
            play?.text ||
            play?.shortText ||
            "Touchdown",

          participantIds: ids,
        };
      }
    );
}

function starterMatchesPlay(
  starter,
  play
) {
  const playerId =
    String(
      starter?.playerId ||
      starter?.id ||
      ""
    );

  if (
    playerId &&
    play.participantIds.includes(
      playerId
    )
  ) {
    return true;
  }

  const fullName =
    normalize(
      starter?.name
    );

  if (!fullName) {
    return false;
  }

  const playText =
    normalize(
      play.text
    );

  if (
    playText.includes(
      fullName
    )
  ) {
    return true;
  }

  const pieces =
    String(
      starter?.name ||
      ""
    )
      .trim()
      .split(/\s+/);

  if (
    pieces.length >= 2
  ) {
    const lastName =
      normalize(
        pieces[
          pieces.length - 1
        ]
      );

    if (
      lastName.length >= 4 &&
      playText.includes(
        lastName
      )
    ) {
      return true;
    }
  }

  return false;
}


// =========================================================
// PLAYER BOX SCORE MATCHING
// =========================================================

function athleteMatchesStarter(
  athlete,
  starter
) {
  const athleteId =
    String(
      athlete?.id ||
      ""
    );

  const starterId =
    String(
      starter?.playerId ||
      starter?.id ||
      ""
    );

  if (
    athleteId &&
    starterId &&
    athleteId === starterId
  ) {
    return true;
  }

  const athleteName =
    normalize(
      athlete?.displayName ||
      athlete?.fullName ||
      athlete?.shortName
    );

  const starterName =
    normalize(
      starter?.name
    );

  return Boolean(
    athleteName &&
    starterName &&
    (
      athleteName ===
        starterName ||
      athleteName.includes(
        starterName
      ) ||
      starterName.includes(
        athleteName
      )
    )
  );
}


// =========================================================
// EXTRACT PLAYER STATS
// =========================================================

function extractPlayerBoxStats(
  summary,
  starter
) {
  const result = {};

  const teamBlocks =
    summary
      ?.boxscore
      ?.players ||
    [];

  for (
    const teamBlock of
    teamBlocks
  ) {
    const categories =
      teamBlock?.statistics ||
      [];

    for (
      const category of
      categories
    ) {
      const categoryName =
        String(
          category?.name ||
          category?.displayName ||
          ""
        ).toLowerCase();

      const labels =
        category?.labels ||
        category?.names ||
        [];

      const athletes =
        category?.athletes ||
        [];

      for (
        const row of
        athletes
      ) {
        const athlete =
          row?.athlete ||
          {};

        if (
          !athleteMatchesStarter(
            athlete,
            starter
          )
        ) {
          continue;
        }

        if (
          !result[
            categoryName
          ]
        ) {
          result[
            categoryName
          ] = {};
        }

        const values =
          row?.stats ||
          [];

        for (
          let i = 0;
          i <
          Math.max(
            labels.length,
            values.length
          );
          i++
        ) {
          const label =
            labels[i] ||
            `STAT${i}`;

          result[
            categoryName
          ][label] =
            values[i];
        }
      }
    }
  }

  return result;
}

function findCategory(
  stats,
  contains
) {
  const key =
    Object.keys(
      stats || {}
    ).find(
      (name) =>
        name.includes(
          contains
        )
    );

  return key
    ? stats[key]
    : {};
}


// =========================================================
// STAT VALUE HELPERS
// =========================================================

function getStat(
  category,
  aliases
) {
  if (!category) {
    return undefined;
  }

  const wanted =
    aliases.map(
      normalizeStatKey
    );

  for (
    const [
      label,
      value,
    ] of Object.entries(
      category
    )
  ) {
    const normalized =
      normalizeStatKey(
        label
      );

    if (
      wanted.includes(
        normalized
      )
    ) {
      return value;
    }
  }

  return undefined;
}

function hasStat(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== ""
  );
}

function numericStat(value) {
  if (!hasStat(value)) {
    return 0;
  }

  const parsed =
    Number(
      String(value)
        .replace(/,/g, "")
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function addStat(
  parts,
  value,
  label,
  options = {}
) {
  if (!hasStat(value)) {
    return;
  }

  if (
    options.onlyPositive &&
    numericStat(value) <= 0
  ) {
    return;
  }

  parts.push(
    `${value} ${label}`
  );
}


// =========================================================
// FUMBLES
// =========================================================

function addFumbles(
  parts,
  fumbles
) {
  const fum =
    getStat(
      fumbles,
      [
        "FUM",
        "FUMBLES",
      ]
    );

  const lost =
    getStat(
      fumbles,
      [
        "LOST",
        "FUMLOST",
        "FUMBLESLOST",
      ]
    );

  if (
    numericStat(fum) > 0
  ) {
    parts.push(
      `${fum} FUM`
    );
  }

  if (
    numericStat(lost) > 0
  ) {
    parts.push(
      `${lost} LOST`
    );
  }
}


// =========================================================
// BUILD PLAYER STAT LINE
// =========================================================

function buildPlayerStatLine(
  starter,
  boxStats
) {
  const position =
    String(
      starter?.position ||
      ""
    ).toUpperCase();

  const passing =
    findCategory(
      boxStats,
      "pass"
    );

  const rushing =
    findCategory(
      boxStats,
      "rush"
    );

  const receiving =
    findCategory(
      boxStats,
      "receiv"
    );

  const fumbles =
    findCategory(
      boxStats,
      "fum"
    );

  const kicking =
    findCategory(
      boxStats,
      "kick"
    );

  const parts = [];


  // =======================================================
  // COMMON VALUES
  // =======================================================

  const passCompAtt =
    getStat(
      passing,
      [
        "C/ATT",
        "COMP/ATT",
        "CMP/ATT",
      ]
    );

  const passYds =
    getStat(
      passing,
      [
        "YDS",
        "PASS YDS",
      ]
    );

  const passTd =
    getStat(
      passing,
      [
        "TD",
        "PASS TD",
      ]
    );

  const interceptions =
    getStat(
      passing,
      [
        "INT",
        "INTERCEPTIONS",
      ]
    );


  const carries =
    getStat(
      rushing,
      [
        "CAR",
        "ATT",
        "RUSH ATT",
      ]
    );

  const rushYds =
    getStat(
      rushing,
      [
        "YDS",
        "RUSH YDS",
      ]
    );

  const rushTd =
    getStat(
      rushing,
      [
        "TD",
        "RUSH TD",
      ]
    );


  const receptions =
    getStat(
      receiving,
      [
        "REC",
        "RECEPTIONS",
      ]
    );

  const targets =
    getStat(
      receiving,
      [
        "TGTS",
        "TGT",
        "TARGETS",
      ]
    );

  const recYds =
    getStat(
      receiving,
      [
        "YDS",
        "REC YDS",
        "RECEIVING YDS",
      ]
    );

  const recTd =
    getStat(
      receiving,
      [
        "TD",
        "REC TD",
        "RECEIVING TD",
      ]
    );


  // =======================================================
  // QB
  // =======================================================

  if (position === "QB") {
    addStat(
      parts,
      passCompAtt,
      "CMP/ATT"
    );

    addStat(
      parts,
      passYds,
      "PASS YDS"
    );

    addStat(
      parts,
      passTd,
      "PASS TD",
      {
        onlyPositive:
          true,
      }
    );

    addStat(
      parts,
      interceptions,
      "INT",
      {
        onlyPositive:
          true,
      }
    );

    addStat(
      parts,
      carries,
      "CAR",
      {
        onlyPositive:
          true,
      }
    );

    if (
      numericStat(carries) > 0 ||
      numericStat(rushYds) !== 0
    ) {
      addStat(
        parts,
        rushYds,
        "RUSH YDS"
      );
    }

    addStat(
      parts,
      rushTd,
      "RUSH TD",
      {
        onlyPositive:
          true,
      }
    );

    // Rare QB reception/trick play
    addStat(
      parts,
      receptions,
      "REC",
      {
        onlyPositive:
          true,
      }
    );

    if (
      numericStat(receptions) > 0
    ) {
      addStat(
        parts,
        recYds,
        "REC YDS"
      );

      addStat(
        parts,
        recTd,
        "REC TD",
        {
          onlyPositive:
            true,
        }
      );
    }

    addFumbles(
      parts,
      fumbles
    );

    return parts.join(
      " · "
    );
  }


  // =======================================================
  // RB
  // Gibbs-style complete line:
  // rushing + receiving + targets + fumbles
  // =======================================================

  if (position === "RB") {
    addStat(
      parts,
      carries,
      "CAR"
    );

    addStat(
      parts,
      rushYds,
      "RUSH YDS"
    );

    addStat(
      parts,
      rushTd,
      "RUSH TD",
      {
        onlyPositive:
          true,
      }
    );

    addStat(
      parts,
      receptions,
      "REC"
    );

    addStat(
      parts,
      recYds,
      "REC YDS"
    );

    addStat(
      parts,
      targets,
      "TGTS"
    );

    addStat(
      parts,
      recTd,
      "REC TD",
      {
        onlyPositive:
          true,
      }
    );

    addFumbles(
      parts,
      fumbles
    );

    return parts.join(
      " · "
    );
  }


  // =======================================================
  // WR / TE
  // Receiving + rushing + fumbles
  // =======================================================

  if (
    position === "WR" ||
    position === "TE"
  ) {
    addStat(
      parts,
      receptions,
      "REC"
    );

    addStat(
      parts,
      recYds,
      "REC YDS"
    );

    addStat(
      parts,
      targets,
      "TGTS"
    );

    addStat(
      parts,
      recTd,
      "REC TD",
      {
        onlyPositive:
          true,
      }
    );

    // Jet sweeps / designed carries
    if (
      numericStat(carries) > 0
    ) {
      addStat(
        parts,
        carries,
        "CAR"
      );

      addStat(
        parts,
        rushYds,
        "RUSH YDS"
      );
    }

    addStat(
      parts,
      rushTd,
      "RUSH TD",
      {
        onlyPositive:
          true,
      }
    );

    // Rare passing play by WR
    if (
      hasStat(passCompAtt)
    ) {
      addStat(
        parts,
        passCompAtt,
        "CMP/ATT"
      );

      addStat(
        parts,
        passYds,
        "PASS YDS"
      );

      addStat(
        parts,
        passTd,
        "PASS TD",
        {
          onlyPositive:
            true,
        }
      );
    }

    addFumbles(
      parts,
      fumbles
    );

    return parts.join(
      " · "
    );
  }


  // =======================================================
  // KICKER
  // =======================================================

  if (position === "K") {
    const fg =
      getStat(
        kicking,
        [
          "FG",
          "FGM/A",
          "FGM-FGA",
          "FGM/FGA",
        ]
      );

    const xp =
      getStat(
        kicking,
        [
          "XP",
          "XPM/A",
          "XPM-XPA",
          "XPM/XPA",
        ]
      );

    const long =
      getStat(
        kicking,
        [
          "LONG",
          "LNG",
        ]
      );

    const pts =
      getStat(
        kicking,
        [
          "PTS",
          "POINTS",
        ]
      );

    addStat(
      parts,
      fg,
      "FG"
    );

    addStat(
      parts,
      xp,
      "XP"
    );

    if (
      hasStat(long)
    ) {
      parts.push(
        `LONG ${long}`
      );
    }

    addStat(
      parts,
      pts,
      "NFL PTS"
    );

    return parts.join(
      " · "
    );
  }


  // =======================================================
  // GENERIC FALLBACK
  // =======================================================

  addStat(
    parts,
    carries,
    "CAR",
    {
      onlyPositive:
        true,
    }
  );

  if (
    numericStat(carries) > 0
  ) {
    addStat(
      parts,
      rushYds,
      "RUSH YDS"
    );
  }

  addStat(
    parts,
    rushTd,
    "RUSH TD",
    {
      onlyPositive:
        true,
    }
  );

  addStat(
    parts,
    receptions,
    "REC",
    {
      onlyPositive:
        true,
    }
  );

  if (
    numericStat(receptions) > 0
  ) {
    addStat(
      parts,
      recYds,
      "REC YDS"
    );

    addStat(
      parts,
      targets,
      "TGTS"
    );
  }

  addStat(
    parts,
    recTd,
    "REC TD",
    {
      onlyPositive:
        true,
    }
  );

  addStat(
    parts,
    passYds,
    "PASS YDS",
    {
      onlyPositive:
        true,
    }
  );

  addStat(
    parts,
    passTd,
    "PASS TD",
    {
      onlyPositive:
        true,
    }
  );

  addFumbles(
    parts,
    fumbles
  );

  return parts.join(
    " · "
  );
}


// =========================================================
// FIND PLAYER BOX STATS
// =========================================================

function findPlayerBoxStats(
  starter,
  summaries
) {
  for (
    const summary of
    summaries
  ) {
    const stats =
      extractPlayerBoxStats(
        summary,
        starter
      );

    if (
      Object.keys(
        stats
      ).length
    ) {
      return stats;
    }
  }

  return {};
}


// =========================================================
// MAIN RUNNER
// =========================================================

async function runNotifications() {
  const league =
    await getLeagueData();

  const season =
    Number(
      league.currentSeason
    );

  const week =
    Number(
      league.currentWeek
    );

  const owners =
    league.owners ||
    [];

  const teams =
    league.currentTeams ||
    [];

  const matchups =
    (
      league
        .currentSeasonMatchups ||
      []
    ).filter(
      (game) =>
        Number(
          game.matchup_period
        ) === week
    );


  if (!matchups.length) {
    return {
      ok: true,
      message:
        "No current matchups.",
    };
  }


  const ownerMap =
    new Map(
      owners.map(
        (owner) => [
          Number(owner.id),
          owner.name,
        ]
      )
    );


  const teamByOwner =
    new Map();


  for (const team of teams) {
    const ownerId =
      Number(
        team.owner_id ??
        team.ownerId ??
        0
      );

    if (ownerId) {
      teamByOwner.set(
        ownerId,
        team
      );
    }
  }


  const subscriptions =
    await loadSubscriptions();


  let intel = null;


  try {
    intel =
      await getMatchupIntel(
        week
      );
  } catch (error) {
    console.error(
      "Matchup intel error:",
      error
    );
  }


  function ownerIntel(
    ownerId
  ) {
    const team =
      teamByOwner.get(
        Number(ownerId)
      );

    if (
      !team ||
      !intel
    ) {
      return null;
    }

    const espnTeamId =
      Number(
        team.espnTeamId ??
        team.espn_team_id ??
        team.id ??
        0
      );

    return (
      intel
        ?.teamMap
        ?.get(espnTeamId) ||
      null
    );
  }


  function espnTeamIdForOwner(
    ownerId
  ) {
    const team =
      teamByOwner.get(
        Number(ownerId)
      );

    return Number(
      team?.espnTeamId ??
      team?.espn_team_id ??
      team?.id ??
      0
    );
  }


  let pushesSent = 0;


  // =======================================================
  // NFL DATA
  // =======================================================

  const nflEvents =
    await getNflEvents(
      season,
      week
    );


  const summaries = [];
  const summaryByEvent =
    new Map();


  for (
    const event of
    nflEvents
  ) {
    if (
      eventState(event) ===
      "pre"
    ) {
      continue;
    }

    try {
      const summary =
        await getNflSummary(
          event,
          season,
          week
        );

      summaries.push(
        summary
      );

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


  const fantasyPoints =
    await getFantasyPointsByTeam(
      season,
      week
    );


  // =======================================================
  // MATCHUP START
  // =======================================================

  for (
    const game of
    matchups
  ) {
    const awayId =
      Number(
        game.away_owner_id
      );

    const homeId =
      Number(
        game.home_owner_id
      );

    const awayName =
      ownerMap.get(
        awayId
      ) ||
      "Away";

    const homeName =
      ownerMap.get(
        homeId
      ) ||
      "Home";


    const starters = [
      ...(
        ownerIntel(
          awayId
        )?.starters ||
        []
      ),

      ...(
        ownerIntel(
          homeId
        )?.starters ||
        []
      ),
    ];


    const started =
      starters.some(
        (player) =>
          player?.nflGameState ===
            "in" ||
          player?.nflGameState ===
            "post"
      );


    if (!started) {
      continue;
    }


    const key =
      `start:${season}:${week}:${matchupKey(
        game
      )}`;


    if (
      await getState(key)
    ) {
      continue;
    }


    pushesSent +=
      await pushToOwner(
        subscriptions,
        awayId,
        {
          title:
            "🏈 MATCHUP START",

          body:
            `Your Week ${week} matchup vs ${firstName(
              homeName
            )} is underway. ${score(
              game.away_score
            )} – ${score(
              game.home_score
            )}`,

          tag: key,
          url: "/",
        }
      );


    pushesSent +=
      await pushToOwner(
        subscriptions,
        homeId,
        {
          title:
            "🏈 MATCHUP START",

          body:
            `Your Week ${week} matchup vs ${firstName(
              awayName
            )} is underway. ${score(
              game.home_score
            )} – ${score(
              game.away_score
            )}`,

          tag: key,
          url: "/",
        }
      );


    await setState(
      key,
      {
        sent: true,
      }
    );
  }


  // =======================================================
  // TOUCHDOWNS
  // =======================================================

  const touchdownPlays =
    [];


  for (
    const event of
    nflEvents
  ) {
    const summary =
      summaryByEvent.get(
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


  const oldTdState =
    await getState(
      tdStateKey
    );


  const currentKeys =
    touchdownPlays.map(
      (play) =>
        play.key
    );


  // First run establishes baseline.
  if (!oldTdState) {
    await setState(
      tdStateKey,
      {
        seen:
          currentKeys,
      }
    );

  } else {
    const seen =
      new Set(
        oldTdState.seen ||
        []
      );


    const newPlays =
      touchdownPlays.filter(
        (play) =>
          !seen.has(
            play.key
          )
      );


    for (
      const play of
      newPlays
    ) {
      for (
        const game of
        matchups
      ) {
        const awayId =
          Number(
            game.away_owner_id
          );

        const homeId =
          Number(
            game.home_owner_id
          );


        for (
          const ownerId of
          [
            awayId,
            homeId,
          ]
        ) {
          const starters =
            ownerIntel(
              ownerId
            )?.starters ||
            [];


          const matched =
            starters.filter(
              (starter) =>
                starterMatchesPlay(
                  starter,
                  play
                )
            );


          if (!matched.length) {
            continue;
          }


          const names =
            [
              ...new Set(
                matched.map(
                  (player) =>
                    player.name
                )
              ),
            ];


          const opponentId =
            ownerId ===
            awayId
              ? homeId
              : awayId;


          const opponentName =
            ownerMap.get(
              opponentId
            ) ||
            "Opponent";


          const ownerScore =
            ownerId ===
            awayId
              ? game.away_score
              : game.home_score;


          const opponentScore =
            ownerId ===
            awayId
              ? game.home_score
              : game.away_score;


          pushesSent +=
            await pushToOwner(
              subscriptions,
              ownerId,
              {
                title:
                  `🔥 TOUCHDOWN — ${names.join(
                    " + "
                  )}`,

                body:
                  `${firstName(
                    ownerMap.get(
                      ownerId
                    )
                  )} ${score(
                    ownerScore
                  )} · ${firstName(
                    opponentName
                  )} ${score(
                    opponentScore
                  )}`,

                tag:
                  `td:${play.key}:${ownerId}`,

                url: "/",
              }
            );
        }
      }

      seen.add(
        play.key
      );
    }


    await setState(
      tdStateKey,
      {
        seen:
          [...seen]
            .slice(-250),
      }
    );
  }


  // =======================================================
  // PLAYER FINALS
  // =======================================================

  const playerBaselineKey =
    `player-final-baseline:${season}:${week}`;


  const playerBaseline =
    await getState(
      playerBaselineKey
    );


  // Protects against sending old finals immediately
  // when this feature is first deployed.
  if (!playerBaseline) {

    for (
      const game of
      matchups
    ) {
      for (
        const ownerId of
        [
          Number(
            game.away_owner_id
          ),

          Number(
            game.home_owner_id
          ),
        ]
      ) {
        const starters =
          ownerIntel(
            ownerId
          )?.starters ||
          [];


        for (
          const player of
          starters
        ) {
          if (
            player?.nflGameState !==
            "post"
          ) {
            continue;
          }


          const playerId =
            String(
              player?.playerId ||
              player?.id ||
              normalize(
                player?.name
              )
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


    await setState(
      playerBaselineKey,
      {
        initialized: true,
      }
    );

  } else {

    for (
      const game of
      matchups
    ) {
      const awayId =
        Number(
          game.away_owner_id
        );

      const homeId =
        Number(
          game.home_owner_id
        );


      for (
        const ownerId of
        [
          awayId,
          homeId,
        ]
      ) {
        const starters =
          ownerIntel(
            ownerId
          )?.starters ||
          [];


        const fantasyTeamId =
          espnTeamIdForOwner(
            ownerId
          );


        const teamPoints =
          fantasyPoints.get(
            fantasyTeamId
          ) ||
          new Map();


        for (
          const player of
          starters
        ) {
          if (
            player?.nflGameState !==
            "post"
          ) {
            continue;
          }


          const playerId =
            String(
              player?.playerId ||
              player?.id ||
              normalize(
                player?.name
              )
            );


          if (!playerId) {
            continue;
          }


          const stateKey =
            `player-final:${season}:${week}:${ownerId}:${playerId}`;


          if (
            await getState(
              stateKey
            )
          ) {
            continue;
          }


          const actualPoints =
            teamPoints.has(
              playerId
            )
              ? teamPoints.get(
                  playerId
                )
              : null;


          const projection =
            Number(
              player?.projection
            );


          const boxStats =
            findPlayerBoxStats(
              player,
              summaries
            );


          const statLine =
            buildPlayerStatLine(
              player,
              boxStats
            );


          let body =
            `${player?.name || "Your starter"}`;


          if (
            actualPoints !==
            null
          ) {
            body +=
              ` — ${actualPoints.toFixed(
                1
              )} fantasy pts`;
          }


          if (
            Number.isFinite(
              projection
            ) &&
            projection > 0
          ) {
            if (
              actualPoints !==
              null
            ) {
              const difference =
                actualPoints -
                projection;

              body +=
                ` · ${difference >= 0 ? "+" : ""}${difference.toFixed(
                  1
                )} vs proj`;

            } else {
              body +=
                ` · ${projection.toFixed(
                  1
                )} projected`;
            }
          }


          if (statLine) {
            body +=
              `\n${statLine}`;
          }


          pushesSent +=
            await pushToOwner(
              subscriptions,
              ownerId,
              {
                title:
                  "📊 PLAYER FINAL",

                body,

                tag:
                  stateKey,

                url: "/",
              }
            );


          await setState(
            stateKey,
            {
              sent: true,

              player:
                player?.name ||
                null,

              points:
                actualPoints,

              stats:
                statLine ||
                null,
            }
          );
        }
      }
    }
  }


  // =======================================================
  // LEAD CHANGES
  // Only after BOTH teams reach 50 points.
  // =======================================================

  for (
    const game of
    matchups
  ) {
    const awayId =
      Number(
        game.away_owner_id
      );

    const homeId =
      Number(
        game.home_owner_id
      );

    const awayScore =
      num(
        game.away_score
      );

    const homeScore =
      num(
        game.home_score
      );


    const stateKey =
      `leader:${season}:${week}:${matchupKey(
        game
      )}`;


    if (
      awayScore < 50 ||
      homeScore < 50
    ) {
      continue;
    }


    const currentLeader =
      awayScore >
      homeScore
        ? awayId
        : homeScore >
          awayScore
          ? homeId
          : null;


    const oldState =
      await getState(
        stateKey
      );


    if (!oldState) {
      await setState(
        stateKey,
        {
          leader:
            currentLeader,
        }
      );

      continue;
    }


    const oldLeader =
      oldState.leader
        ? Number(
            oldState.leader
          )
        : null;


    if (
      currentLeader &&
      oldLeader &&
      currentLeader !==
        oldLeader
    ) {
      const leaderName =
        ownerMap.get(
          currentLeader
        ) ||
        "A team";

      const awayName =
        ownerMap.get(
          awayId
        ) ||
        "Away";

      const homeName =
        ownerMap.get(
          homeId
        ) ||
        "Home";


      const body =
        `${firstName(
          leaderName
        )} takes the lead. ` +
        `${firstName(
          awayName
        )} ${score(
          awayScore
        )} · ` +
        `${firstName(
          homeName
        )} ${score(
          homeScore
        )}`;


      pushesSent +=
        await pushToOwner(
          subscriptions,
          awayId,
          {
            title:
              "🔄 LEAD CHANGE",

            body,

            tag:
              `lead:${season}:${week}:${matchupKey(
                game
              )}:${currentLeader}`,

            url: "/",
          }
        );


      pushesSent +=
        await pushToOwner(
          subscriptions,
          homeId,
          {
            title:
              "🔄 LEAD CHANGE",

            body,

            tag:
              `lead:${season}:${week}:${matchupKey(
                game
              )}:${currentLeader}`,

            url: "/",
          }
        );
    }


    await setState(
      stateKey,
      {
        leader:
          currentLeader,
      }
    );
  }


  // =======================================================
  // THURSDAY + SUNDAY UPDATES
  // =======================================================

  const dayGroups = [
    {
      day: "Thursday",
      title:
        "🏈 THURSDAY UPDATE",
      slug:
        "thursday",
    },

    {
      day: "Sunday",
      title:
        "🏈 SUNDAY UPDATE",
      slug:
        "sunday",
    },
  ];


  for (
    const group of
    dayGroups
  ) {
    const dayEvents =
      nflEvents.filter(
        (event) =>
          eventDay(
            event
          ) ===
          group.day
      );


    if (!dayEvents.length) {
      continue;
    }


    const complete =
      dayEvents.every(
        (event) =>
          eventState(
            event
          ) ===
          "post"
      );


    if (!complete) {
      continue;
    }


    for (
      const game of
      matchups
    ) {
      const awayId =
        Number(
          game.away_owner_id
        );

      const homeId =
        Number(
          game.home_owner_id
        );


      const awayName =
        ownerMap.get(
          awayId
        ) ||
        "Away";

      const homeName =
        ownerMap.get(
          homeId
        ) ||
        "Home";


      const stateKey =
        `${group.slug}:${season}:${week}:${matchupKey(
          game
        )}`;


      if (
        await getState(
          stateKey
        )
      ) {
        continue;
      }


      const body =
        `${firstName(
          awayName
        )} ${score(
          game.away_score
        )} · ` +
        `${firstName(
          homeName
        )} ${score(
          game.home_score
        )}`;


      pushesSent +=
        await pushToOwner(
          subscriptions,
          awayId,
          {
            title:
              group.title,

            body,

            tag:
              stateKey,

            url: "/",
          }
        );


      pushesSent +=
        await pushToOwner(
          subscriptions,
          homeId,
          {
            title:
              group.title,

            body,

            tag:
              stateKey,

            url: "/",
          }
        );


      await setState(
        stateKey,
        {
          sent: true,
        }
      );
    }
  }


  // =======================================================
  // FANTASY MATCHUP FINAL
  // =======================================================

  for (
    const game of
    matchups
  ) {
    if (
      game.completed !== true
    ) {
      continue;
    }


    const awayId =
      Number(
        game.away_owner_id
      );

    const homeId =
      Number(
        game.home_owner_id
      );


    const awayName =
      ownerMap.get(
        awayId
      ) ||
      "Away";

    const homeName =
      ownerMap.get(
        homeId
      ) ||
      "Home";


    const awayScore =
      num(
        game.away_score
      );

    const homeScore =
      num(
        game.home_score
      );


    const stateKey =
      `final:${season}:${week}:${matchupKey(
        game
      )}`;


    if (
      await getState(
        stateKey
      )
    ) {
      continue;
    }


    let body;


    if (
      awayScore ===
      homeScore
    ) {
      body =
        `${firstName(
          awayName
        )} ${score(
          awayScore
        )} · ` +
        `${firstName(
          homeName
        )} ${score(
          homeScore
        )}`;

    } else {
      const winnerName =
        awayScore >
        homeScore
          ? awayName
          : homeName;


      const loserName =
        awayScore >
        homeScore
          ? homeName
          : awayName;


      const winnerScore =
        Math.max(
          awayScore,
          homeScore
        );


      const loserScore =
        Math.min(
          awayScore,
          homeScore
        );


      body =
        `${firstName(
          winnerName
        )} defeats ${firstName(
          loserName
        )} · ` +
        `${score(
          winnerScore
        )} – ${score(
          loserScore
        )}`;
    }


    pushesSent +=
      await pushToOwner(
        subscriptions,
        awayId,
        {
          title:
            "🏆 FINAL",

          body,

          tag:
            stateKey,

          url: "/",
        }
      );


    pushesSent +=
      await pushToOwner(
        subscriptions,
        homeId,
        {
          title:
            "🏆 FINAL",

          body,

          tag:
            stateKey,

          url: "/",
        }
      );


    await setState(
      stateKey,
      {
        sent: true,
      }
    );
  }


  return {
    ok: true,
    season,
    week,
    matchups:
      matchups.length,
    pushesSent,
  };
}


// =========================================================
// ROUTES
// =========================================================

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
