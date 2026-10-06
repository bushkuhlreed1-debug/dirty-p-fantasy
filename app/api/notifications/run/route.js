import { NextResponse } from "next/server";

import {
  supabaseAdmin,
} from "../../../../lib/supabaseAdmin";

import {
  sendPush,
} from "../../../../lib/push";

import {
  getLeagueData,
} from "../../../../lib/leagueData";

import {
  getMatchupIntel,
} from "../../../../lib/matchupIntel";


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
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function score(value) {
  return num(value).toFixed(2);
}


function firstName(name = "") {
  return (
    String(name)
      .trim()
      .split(" ")[0] ||
    name
  );
}


function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}


function matchupKey(game) {
  const a =
    Number(
      game.away_owner_id
    );

  const h =
    Number(
      game.home_owner_id
    );

  return `${Math.min(a, h)}-${Math.max(a, h)}`;
}


// =========================================================
// SUPABASE STATE
// =========================================================

async function getState(
  stateKey
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "notification_state"
      )
      .select(
        "state_value"
      )
      .eq(
        "state_key",
        stateKey
      )
      .maybeSingle();


  if (error) {
    throw error;
  }


  return (
    data?.state_value ||
    null
  );
}


async function setState(
  stateKey,
  stateValue
) {
  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "notification_state"
      )
      .upsert(
        {
          state_key:
            stateKey,

          state_value:
            stateValue,

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "state_key",
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
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "push_subscriptions"
      )
      .select(
        "id, owner_id, endpoint, p256dh, auth"
      )
      .eq(
        "enabled",
        true
      );


  if (error) {
    throw error;
  }


  const byOwner =
    new Map();


  for (
    const subscription of
    data || []
  ) {
    const ownerId =
      Number(
        subscription.owner_id
      );


    if (!ownerId) {
      continue;
    }


    if (
      !byOwner.has(
        ownerId
      )
    ) {
      byOwner.set(
        ownerId,
        []
      );
    }


    byOwner
      .get(ownerId)
      .push(
        subscription
      );
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


  for (
    const subscription of
    subscriptions
  ) {
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
        error?.statusCode ===
          404 ||
        error?.statusCode ===
          410
      ) {
        await supabaseAdmin
          .from(
            "push_subscriptions"
          )
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
// NFL DATA
// =========================================================

async function getJson(
  url
) {
  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",
      }
    );


  if (!response.ok) {
    throw new Error(
      `ESPN request failed: ${response.status}`
    );
  }


  return response.json();
}


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


  return Array.isArray(
    data?.events
  )
    ? data.events
    : [];
}


async function getNflSummary(
  eventId
) {
  return getJson(
    `${NFL_SUMMARY}?event=${eventId}`
  );
}


function eventState(
  event
) {
  return (
    event
      ?.status
      ?.type
      ?.state ||
    ""
  );
}


function eventDay(
  event
) {
  if (!event?.date) {
    return "";
  }


  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Chicago",

        weekday:
          "long",
      }
    ).format(
      new Date(
        event.date
      )
    );
  } catch {
    return "";
  }
}


// =========================================================
// TOUCHDOWN HELPERS
// =========================================================

function scoringPlaysFromSummary(
  summary,
  eventId
) {
  const scoringPlays =
    Array.isArray(
      summary?.scoringPlays
    )
      ? summary.scoringPlays
      : [];


  return scoringPlays
    .filter(
      (play) => {
        const type =
          String(
            play
              ?.type
              ?.text ||
              ""
          ).toLowerCase();


        const text =
          String(
            play?.text ||
            play
              ?.shortText ||
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
            play
              ?.participants
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
            play
              ?.shortText ||
            "Touchdown",

          participantIds:
            ids,
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
          pieces.length -
          1
        ]
      );


    if (
      lastName.length >=
        4 &&
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
      league.currentSeasonMatchups ||
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
          Number(
            owner.id
          ),
          owner.name,
        ]
      )
    );


  const teamByOwner =
    new Map();


  for (
    const team of
    teams
  ) {
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


  let intel =
    null;


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
        ?.get(
          espnTeamId
        ) ||
      null
    );
  }


  let pushesSent = 0;


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
          player
            ?.nflGameState ===
            "in" ||
          player
            ?.nflGameState ===
            "post"
      );


    if (!started) {
      continue;
    }


    const key =
      `start:${season}:${week}:${matchupKey(
        game
      )}`;


    const existing =
      await getState(
        key
      );


    if (existing) {
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

          tag:
            key,

          url:
            "/",
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

          tag:
            key,

          url:
            "/",
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

  const nflEvents =
    await getNflEvents(
      season,
      week
    );


  const touchdownPlays =
    [];


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
          event.id
        );


      touchdownPlays.push(
        ...scoringPlaysFromSummary(
          summary,
          event.id
        )
      );

    } catch (error) {
      console.error(
        "NFL summary error:",
        event.id,
        error
      );
    }
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


  // First run establishes a baseline.
  // This prevents old touchdowns from
  // firing as brand-new alerts.
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
          const ownerTeam =
            ownerIntel(
              ownerId
            );


          const starters =
            ownerTeam
              ?.starters ||
            [];


          const matched =
            starters.filter(
              (starter) =>
                starterMatchesPlay(
                  starter,
                  play
                )
            );


          if (
            !matched.length
          ) {
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

                url:
                  "/",
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
          [...seen].slice(
            -250
          ),
      }
    );
  }


  // =======================================================
  // LEAD CHANGES
  // Only after BOTH teams reach 50.
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

            url:
              "/",
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

            url:
              "/",
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
      day:
        "Thursday",

      title:
        "🏈 THURSDAY UPDATE",

      slug:
        "thursday",
    },

    {
      day:
        "Sunday",

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


    if (
      !dayEvents.length
    ) {
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

            url:
              "/",
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

            url:
              "/",
          }
        );


      await setState(
        stateKey,
        {
          sent:
            true,
        }
      );
    }
  }


  // =======================================================
  // FINAL SCORE
  // =======================================================

  for (
    const game of
    matchups
  ) {
    if (
      game.completed !==
      true
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

          url:
            "/",
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

          url:
            "/",
        }
      );


    await setState(
      stateKey,
      {
        sent:
          true,
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
