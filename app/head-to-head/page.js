import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function getGameType(game) {
  const matchupType = String(game.matchup_type || "")
    .trim()
    .toLowerCase();

  const playoffTier = String(game.playoff_tier || "")
    .trim()
    .toLowerCase();

  if (
    matchupType === "consolation" ||
    matchupType.includes("consolation") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("losers") ||
    playoffTier.includes("loser")
  ) {
    return "consolation";
  }

  if (
    matchupType === "playoff" ||
    matchupType.includes("championship") ||
    playoffTier.includes("winners_bracket") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship") ||
    game.is_championship === true
  ) {
    return "playoff";
  }

  return "regular";
}

function getResult(game, side) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "TIE") return "T";
  if (winner === side) return "W";

  if (winner === "HOME" || winner === "AWAY") {
    return "L";
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  if (home === away) return "T";

  if (side === "HOME") {
    return home > away ? "W" : "L";
  }

  return away > home ? "W" : "L";
}

function recordText(wins, losses, ties = 0) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

function buildRecord(games, owner1Id) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of games) {
    const owner1IsHome =
      Number(game.home_owner_id) === owner1Id;

    const result = getResult(
      game,
      owner1IsHome ? "HOME" : "AWAY"
    );

    if (result === "W") {
      owner1Wins += 1;
    } else if (result === "L") {
      owner2Wins += 1;
    } else {
      ties += 1;
    }
  }

  return {
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function getGameView(game, owner1Id, owner2Id) {
  const owner1IsHome =
    Number(game.home_owner_id) === owner1Id;

  const owner1Score = owner1IsHome
    ? num(game.home_score)
    : num(game.away_score);

  const owner2Score = owner1IsHome
    ? num(game.away_score)
    : num(game.home_score);

  const owner1Team = owner1IsHome
    ? game.home_team_name
    : game.away_team_name;

  const owner2Team = owner1IsHome
    ? game.away_team_name
    : game.home_team_name;

  const owner1Result = getResult(
    game,
    owner1IsHome ? "HOME" : "AWAY"
  );

  return {
    ...game,
    owner1Id,
    owner2Id,
    owner1Score,
    owner2Score,
    owner1Team,
    owner2Team,
    owner1Result,
    type: getGameType(game),
    margin: Math.abs(owner1Score - owner2Score),
    season: Number(game.season_year),
    week: Number(game.matchup_period),
  };
}

/*
  OFFICIAL DIRTY P RIVALRY WEEK MATCHUPS

  These are matched by owner names instead of database IDs
  so the code remains readable and easy to update.
*/
const OFFICIAL_RIVALRIES = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

function isOfficialRivalry(owner1Name, owner2Name) {
  return OFFICIAL_RIVALRIES.some(([a, b]) => {
    return (
      (a === owner1Name && b === owner2Name) ||
      (a === owner2Name && b === owner1Name)
    );
  });
}

function getCurrentStreak(games) {
  if (!games.length) return null;

  const newestFirst = [...games].sort(
    (a, b) =>
      b.season - a.season ||
      b.week - a.week
  );

  const latest = newestFirst[0];

  if (latest.owner1Result === "T") {
    return null;
  }

  const targetResult = latest.owner1Result;
  let count = 0;

  for (const game of newestFirst) {
    if (game.owner1Result === targetResult) {
      count += 1;
    } else {
      break;
    }
  }

  return {
    owner:
      targetResult === "W"
        ? "owner1"
        : "owner2",
    count,
  };
}

function getLongestStreak(games) {
  if (!games.length) return null;

  const chronological = [...games].sort(
    (a, b) =>
      a.season - b.season ||
      a.week - b.week
  );

  let currentOwner = null;
  let currentCount = 0;

  let bestOwner = null;
  let bestCount = 0;

  for (const game of chronological) {
    if (game.owner1Result === "T") {
      currentOwner = null;
      currentCount = 0;
      continue;
    }

    const winner =
      game.owner1Result === "W"
        ? "owner1"
        : "owner2";

    if (winner === currentOwner) {
      currentCount += 1;
    } else {
      currentOwner = winner;
      currentCount = 1;
    }

    if (currentCount > bestCount) {
      bestOwner = currentOwner;
      bestCount = currentCount;
    }
  }

  if (!bestOwner) return null;

  return {
    owner: bestOwner,
    count: bestCount,
  };
}

function getRecentRecord(games, limit = 5) {
  const recent = [...games]
    .sort(
      (a, b) =>
        b.season - a.season ||
        b.week - a.week
    )
    .slice(0, limit);

  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of recent) {
    if (game.owner1Result === "W") {
      owner1Wins += 1;
    } else if (game.owner1Result === "L") {
      owner2Wins += 1;
    } else {
      ties += 1;
    }
  }

  return {
    games: recent.length,
    owner1Wins,
    owner2Wins,
    ties,
  };
}

function gameWinnerName(game, owner1Name, owner2Name) {
  if (!game || game.owner1Result === "T") {
    return null;
  }

  return game.owner1Result === "W"
    ? owner1Name
    : owner2Name;
}

function gameLoserName(game, owner1Name, owner2Name) {
  if (!game || game.owner1Result === "T") {
    return null;
  }

  return game.owner1Result === "W"
    ? owner2Name
    : owner1Name;
}

function firstName(name) {
  return String(name || "").split(" ")[0];
}

function buildMatchupArticle({
  owner1Name,
  owner2Name,
  overall,
  meetings,
  owner1Points,
  owner2Points,
  regularRecord,
  playoffRecord,
  consolationRecord,
  championshipGames,
  biggestWin,
  closestGame,
  latestGame,
  currentStreak,
  longestStreak,
  recentRecord,
  officialRivalry,
}) {
  if (!meetings) return [];

  const o1 = firstName(owner1Name);
  const o2 = firstName(owner2Name);

  const wins1 = overall.owner1Wins;
  const wins2 = overall.owner2Wins;
  const ties = overall.ties;

  const leaderName =
    wins1 > wins2
      ? owner1Name
      : wins2 > wins1
        ? owner2Name
        : null;

  const trailerName =
    wins1 > wins2
      ? owner2Name
      : wins2 > wins1
        ? owner1Name
        : null;

  const leaderFirst = firstName(leaderName);
  const trailerFirst = firstName(trailerName);

  const lead = Math.abs(wins1 - wins2);

  const pointDifference = Math.abs(
    owner1Points - owner2Points
  );

  const scoringLeader =
    owner1Points > owner2Points
      ? owner1Name
      : owner2Points > owner1Points
        ? owner2Name
        : null;

  const playoffMeetings =
    playoffRecord.owner1Wins +
    playoffRecord.owner2Wins +
    playoffRecord.ties;

  const latestWinner = gameWinnerName(
    latestGame,
    owner1Name,
    owner2Name
  );

  const latestLoser = gameLoserName(
    latestGame,
    owner1Name,
    owner2Name
  );

  const biggestWinner = gameWinnerName(
    biggestWin,
    owner1Name,
    owner2Name
  );

  const biggestLoser = gameLoserName(
    biggestWin,
    owner1Name,
    owner2Name
  );

  const currentStreakName =
    currentStreak?.owner === "owner1"
      ? owner1Name
      : currentStreak?.owner === "owner2"
        ? owner2Name
        : null;

  const longestStreakName =
    longestStreak?.owner === "owner1"
      ? owner1Name
      : longestStreak?.owner === "owner2"
        ? owner2Name
        : null;

  const paragraphs = [];

  /*
    PARAGRAPH 1:
    Establish the matchup and roast the overall record.
  */

  let opening = "";

  if (officialRivalry) {
    if (leaderName && lead >= 6) {
      opening =
        `This one comes with an official Rivalry Week label, although ${trailerFirst} may want to file an appeal with the league office. ` +
        `${leaderName} has controlled the matchup ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} across ${meetings} meetings. At this point, ${trailerFirst} doesn't need more rivalry hype nearly as much as ${trailerFirst} needs some wins.`;
    } else if (leaderName && lead >= 3) {
      opening =
        `This one is officially a Dirty P rivalry, and ${leaderFirst} currently owns the better set of bragging rights. ` +
        `${leaderName} leads ${trailerName} ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} through ${meetings} meetings. It isn't a burial, but it is definitely enough of an advantage for ${leaderFirst} to bring it up whenever convenient.`;
    } else if (leaderName) {
      opening =
        `This is exactly what Rivalry Week is supposed to look like: enough history to talk shit and not enough separation for either guy to get too comfortable. ` +
        `${leaderName} holds a narrow ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} edge over ${trailerName} through ${meetings} meetings. One decent run could flip the whole thing, so the bragging rights here come with an expiration date.`;
    } else {
      opening =
        `Of course these two ended up as official Rivalry Week opponents. After ${meetings} meetings, ${owner1Name} and ${owner2Name} are deadlocked at ${recordText(
          wins1,
          wins2,
          ties
        )}. That's a lot of football to produce absolutely no convincing answer about who gets to talk the most shit.`;
    }
  } else {
    if (leaderName && lead >= 7) {
      opening =
        `There really isn't a polite way to dress this one up: ${leaderFirst} has had ${trailerFirst}'s number. ` +
        `${leaderName} owns a ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} advantage through ${meetings} meetings, which has turned this head-to-head history into a fairly reliable source of pain for ${trailerFirst}.`;
    } else if (leaderName && lead >= 4) {
      opening =
        `${leaderName} has been the one doing most of the smiling in this matchup. ` +
        `${leaderFirst} leads ${trailerFirst} ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} across ${meetings} meetings. ${trailerFirst} has landed enough punches to keep it respectable, but the historical receipt still belongs to ${leaderFirst}.`;
    } else if (leaderName) {
      opening =
        `${owner1Name} and ${owner2Name} have seen plenty of each other over the years, and neither has managed to completely shake the other. ` +
        `${leaderName} currently holds a ${recordText(
          Math.max(wins1, wins2),
          Math.min(wins1, wins2),
          ties
        )} advantage through ${meetings} meetings, which is enough to talk a little shit but probably not enough to get reckless with it.`;
    } else {
      opening =
        `${owner1Name} and ${owner2Name} have played ${meetings} times and somehow still haven't settled much of anything. ` +
        `The all-time matchup sits at ${recordText(
          wins1,
          wins2,
          ties
        )}. In other words, anybody trying to claim ownership of this matchup is going to need a better argument than the record.`;
    }
  }

  paragraphs.push(opening);

  /*
    PARAGRAPH 2:
    Scoring + blowout + closest game.
  */

  let scoringParagraph = "";

  if (pointDifference < 25) {
    scoringParagraph =
      `The scoreboard backs up how little separates them. Only ${formatScore(
        pointDifference
      )} total points separate the two across the entire matchup history, with ${formatScore(
        owner1Points
      )} for ${o1} and ${formatScore(
        owner2Points
      )} for ${o2}. That's basically statistical noise after ${meetings} games, so neither side gets to pretend the scoring tells a dramatically different story.`;
  } else if (pointDifference < 100) {
    scoringParagraph =
      `${scoringLeader} also owns the edge in cumulative scoring, but this hasn't exactly been a runaway. ` +
      `The two are separated by ${formatScore(
        pointDifference
      )} total points across ${meetings} meetings, close enough that a couple ugly Sundays could swing the scoring bragging rights in a hurry.`;
  } else {
    scoringParagraph =
      `${scoringLeader} hasn't just won more points on the schedule — the scoring totals have created some separation too. ` +
      `Across ${meetings} meetings, the gap sits at ${formatScore(
        pointDifference
      )} points. That's enough evidence that somebody has spent a little too much time watching the other guy's lineup go off.`;
  }

  if (biggestWin && biggestWinner && biggestLoser) {
    if (biggestWin.margin >= 60) {
      scoringParagraph +=
        ` The low point for ${firstName(
          biggestLoser
        )} came in Week ${biggestWin.week} of ${biggestWin.season}, when ${firstName(
          biggestWinner
        )} handed him a ${formatScore(
          biggestWin.margin
        )}-point ass-kicking. There are losses, and then there are scores you hope nobody ever adds to a permanent league archive. Too late.`;
    } else if (biggestWin.margin >= 35) {
      scoringParagraph +=
        ` The biggest beating came in Week ${biggestWin.week} of ${biggestWin.season}, when ${firstName(
          biggestWinner
        )} smoked ${firstName(
          biggestLoser
        )} by ${formatScore(
          biggestWin.margin
        )} points. Not quite grounds for retirement, but definitely enough to avoid the group chat for a few hours.`;
    } else {
      scoringParagraph +=
        ` Even the largest win has been relatively contained: ${firstName(
          biggestWinner
        )} owns the biggest margin at ${formatScore(
          biggestWin.margin
        )} points, set in Week ${biggestWin.week} of ${biggestWin.season}.`;
    }
  }

  if (
    closestGame &&
    closestGame.margin <= 1
  ) {
    scoringParagraph +=
      ` On the other end of the spectrum, their Week ${closestGame.week} meeting in ${closestGame.season} was decided by just ${formatScore(
        closestGame.margin
      )} points — the kind of loss that makes you stare at your bench and start blaming people who don't know you exist.`;
  } else if (
    closestGame &&
    closestGame.margin <= 3
  ) {
    scoringParagraph +=
      ` Their closest finish came in Week ${closestGame.week} of ${closestGame.season}, a ${formatScore(
        closestGame.margin
      )}-point squeaker that gave the loser plenty of lineup decisions to regret.`;
  }

  paragraphs.push(scoringParagraph);

  /*
    PARAGRAPH 3:
    Postseason and championship history.
  */

  let postseasonParagraph = "";

  if (championshipGames.length > 0) {
    const championshipWins1 =
      championshipGames.filter(
        (game) => game.owner1Result === "W"
      ).length;

    const championshipWins2 =
      championshipGames.filter(
        (game) => game.owner1Result === "L"
      ).length;

    if (
      championshipGames.length === 1
    ) {
      const titleGame = championshipGames[0];
      const titleWinner = gameWinnerName(
        titleGame,
        owner1Name,
        owner2Name
      );

      const titleLoser = gameLoserName(
        titleGame,
        owner1Name,
        owner2Name
      );

      postseasonParagraph =
        `And then there is the result that carries a little more weight than the rest. ` +
        `${owner1Name} and ${owner2Name} have met once in the Dirty P Championship, and ${titleWinner} walked away with the trophy in ${titleGame.season}. ${firstName(
          titleLoser
        )} can bring up the all-time record, total points or whatever other spreadsheet argument sounds good, but ${firstName(
          titleWinner
        )} has an extremely simple response: scoreboard, trophy, next question.`;
    } else {
      postseasonParagraph =
        `These two have even taken the matchup all the way to the Dirty P Championship ${championshipGames.length} times. ` +
        `${o1} is ${championshipWins1}-${championshipWins2} against ${o2} in those title games. At that point we're not talking about random regular-season damage anymore — somebody's season ended while the other guy got a trophy out of it.`;
    }
  } else if (playoffMeetings > 0) {
    if (
      playoffRecord.owner1Wins ===
      playoffRecord.owner2Wins
    ) {
      postseasonParagraph =
        `The matchup has also spilled into the championship bracket ${playoffMeetings} ${playoffMeetings === 1 ? "time" : "times"}, and even that hasn't provided much separation. ` +
        `The postseason record sits at ${recordText(
          playoffRecord.owner1Wins,
          playoffRecord.owner2Wins,
          playoffRecord.ties
        )} from ${o1}'s perspective. Apparently the regular season wasn't enough time for these two to figure out who should actually have the upper hand.`;
    } else {
      const playoffLeader =
        playoffRecord.owner1Wins >
        playoffRecord.owner2Wins
          ? owner1Name
          : owner2Name;

      postseasonParagraph =
        `The games have mattered beyond the regular season too. They've met ${playoffMeetings} ${playoffMeetings === 1 ? "time" : "times"} in the championship bracket, where ${playoffLeader} owns the better postseason record. ` +
        `Regular-season wins are nice; sending the other guy toward the offseason is a little more fun.`;
    }
  } else {
    postseasonParagraph =
      `For all of that history, these two still haven't met in the championship bracket. So far the damage has been confined to the regular season and consolation side of the schedule. If they ever run into each other with a title actually on the line, we'll finally get some higher-stakes material for this page.`;
  }

  if (
    consolationRecord.owner1Wins +
      consolationRecord.owner2Wins +
      consolationRecord.ties >
    0
  ) {
    const consolationMeetings =
      consolationRecord.owner1Wins +
      consolationRecord.owner2Wins +
      consolationRecord.ties;

    postseasonParagraph +=
      ` They have also crossed paths ${consolationMeetings} ${consolationMeetings === 1 ? "time" : "times"} in consolation play, which still counts in the all-time head-to-head record even if nobody is hanging a banner for it.`;
  }

  paragraphs.push(postseasonParagraph);

  /*
    PARAGRAPH 4:
    Recent form, streaks, final punch line.
  */

  let closing = "";

  if (latestWinner && latestGame) {
    closing =
      `The latest word belongs to ${latestWinner}, who beat ${latestLoser} ${formatScore(
        latestWinner === owner1Name
          ? latestGame.owner1Score
          : latestGame.owner2Score
      )}-${formatScore(
        latestWinner === owner1Name
          ? latestGame.owner2Score
          : latestGame.owner1Score
      )} in Week ${latestGame.week} of ${latestGame.season}.`;
  } else if (latestGame) {
    closing =
      `Their most recent meeting ended in a tie in Week ${latestGame.week} of ${latestGame.season}, because apparently choosing a winner would have been too convenient.`;
  }

  if (
    currentStreak &&
    currentStreak.count >= 4 &&
    currentStreakName
  ) {
    closing +=
      ` More importantly, ${currentStreakName} has now won ${currentStreak.count} straight in the matchup. That's no longer a hot streak. That's becoming a problem.`;
  } else if (
    currentStreak &&
    currentStreak.count >= 2 &&
    currentStreakName
  ) {
    closing +=
      ` ${currentStreakName} has taken the last ${currentStreak.count}, so the recent bragging rights are pretty clearly spoken for.`;
  }

  if (
    longestStreak &&
    longestStreak.count >= 4 &&
    longestStreakName &&
    (!currentStreak ||
      longestStreak.count !== currentStreak.count ||
      longestStreakName !== currentStreakName)
  ) {
    closing +=
      ` The nastiest run in the matchup belongs to ${longestStreakName}, who once stacked ${longestStreak.count} consecutive wins.`;
  }

  if (recentRecord.games >= 3) {
    const recentLead =
      recentRecord.owner1Wins -
      recentRecord.owner2Wins;

    if (recentLead >= 3) {
      closing +=
        ` And lately, ${o1} has been doing most of the damage, going ${recentRecord.owner1Wins}-${recentRecord.owner2Wins}${
          recentRecord.ties
            ? `-${recentRecord.ties}`
            : ""
        } over the last ${recentRecord.games}.`;
    } else if (recentLead <= -3) {
      closing +=
        ` And lately, ${o2} has been doing most of the damage, going ${recentRecord.owner2Wins}-${recentRecord.owner1Wins}${
          recentRecord.ties
            ? `-${recentRecord.ties}`
            : ""
        } over the last ${recentRecord.games}.`;
    }
  }

  if (officialRivalry) {
    if (leaderName && lead >= 5) {
      closing +=
        ` Rivalry Week gives ${trailerFirst} another shot to make this history look a little less ugly. ${leaderFirst}, meanwhile, gets another opportunity to make sure it stays that way.`;
    } else if (leaderName) {
      closing +=
        ` That's where things stand heading into the next chapter of the rivalry: ${leaderFirst} owns the historical edge, but not enough of one to start acting invincible. Rivalry Week exists for exactly this kind of shit.`;
    } else {
      closing +=
        ` So the next Rivalry Week meeting isn't just another game on the schedule. Somebody finally gets another chance to grab the bragging rights instead of sharing them like a participation trophy.`;
    }
  } else if (leaderName && lead >= 5) {
    closing +=
      ` Until ${trailerFirst} starts stacking some wins, though, the historical argument is pretty easy for ${leaderFirst}: just open this page.`;
  } else if (leaderName) {
    closing +=
      ` For now, ${leaderFirst} gets the all-time bragging rights. The margin is small enough that ${trailerFirst} can still shut him up without needing a decade-long rebuild.`;
  } else {
    closing +=
      ` So for now, neither guy has earned the right to act superior. Conveniently, future matchups give them plenty of chances to change that.`;
  }

  paragraphs.push(closing);

  return paragraphs;
}

export default async function HeadToHeadPage({
  searchParams,
}) {
  const params = await searchParams;

  const requestedOwner1 = Number(
    params?.owner1 || 0
  );

  const requestedOwner2 = Number(
    params?.owner2 || 0
  );

  const [
    { data: owners },
    { data: matchupData },
  ] = await Promise.all([
    supabase
      .from("owners")
      .select("id, name")
      .order("name", {
        ascending: true,
      }),

    supabase
      .from("matchups")
      .select("*")
      .lt("season_year", 2026)
      .order("season_year", {
        ascending: true,
      })
      .order("matchup_period", {
        ascending: true,
      }),
  ]);

  const ownerList = owners || [];

  const ownerMap = new Map(
    ownerList.map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  /*
    Default the page to Reed vs Austin if no matchup
    has been selected yet.
  */
  const reed = ownerList.find(
    (owner) =>
      owner.name === "Reed Bushkuhl"
  );

  const austin = ownerList.find(
    (owner) =>
      owner.name === "Austin Lloyd"
  );

  const selectedOwner1 =
    requestedOwner1 ||
    Number(reed?.id || ownerList[0]?.id || 0);

  const selectedOwner2 =
    requestedOwner2 ||
    Number(austin?.id || ownerList[1]?.id || 0);

  const completedGames = (
    matchupData || []
  ).filter((game) => {
    const home = Number(game.home_score);
    const away = Number(game.away_score);

    return (
      game.home_owner_id &&
      game.away_owner_id &&
      game.home_score !== null &&
      game.away_score !== null &&
      Number.isFinite(home) &&
      Number.isFinite(away) &&
      !(home === 0 && away === 0)
    );
  });

  const validSelection =
    selectedOwner1 > 0 &&
    selectedOwner2 > 0 &&
    selectedOwner1 !== selectedOwner2 &&
    ownerMap.has(selectedOwner1) &&
    ownerMap.has(selectedOwner2);

  let comparison = null;

  if (validSelection) {
    const owner1Name =
      ownerMap.get(selectedOwner1);

    const owner2Name =
      ownerMap.get(selectedOwner2);

    const rawGames = completedGames.filter(
      (game) => {
        const homeId = Number(
          game.home_owner_id
        );

        const awayId = Number(
          game.away_owner_id
        );

        return (
          (homeId === selectedOwner1 &&
            awayId === selectedOwner2) ||
          (homeId === selectedOwner2 &&
            awayId === selectedOwner1)
        );
      }
    );

    const games = rawGames
      .map((game) =>
        getGameView(
          game,
          selectedOwner1,
          selectedOwner2
        )
      )
      .sort(
        (a, b) =>
          b.season - a.season ||
          b.week - a.week
      );

    const regularRaw = rawGames.filter(
      (game) =>
        getGameType(game) === "regular"
    );

    const playoffRaw = rawGames.filter(
      (game) =>
        getGameType(game) === "playoff"
    );

    const consolationRaw = rawGames.filter(
      (game) =>
        getGameType(game) ===
        "consolation"
    );

    const overall = buildRecord(
      rawGames,
      selectedOwner1
    );

    const regularRecord = buildRecord(
      regularRaw,
      selectedOwner1
    );

    const playoffRecord = buildRecord(
      playoffRaw,
      selectedOwner1
    );

    const consolationRecord = buildRecord(
      consolationRaw,
      selectedOwner1
    );

    const owner1Points = games.reduce(
      (sum, game) =>
        sum + game.owner1Score,
      0
    );

    const owner2Points = games.reduce(
      (sum, game) =>
        sum + game.owner2Score,
      0
    );

    const meetings = games.length;

    const owner1Average =
      meetings > 0
        ? owner1Points / meetings
        : 0;

    const owner2Average =
      meetings > 0
        ? owner2Points / meetings
        : 0;

    const decidedGames = games.filter(
      (game) =>
        game.owner1Result !== "T"
    );

    const biggestWin =
      decidedGames.length > 0
        ? [...decidedGames].sort(
            (a, b) =>
              b.margin - a.margin
          )[0]
        : null;

    const closestGame =
      decidedGames.length > 0
        ? [...decidedGames].sort(
            (a, b) =>
              a.margin - b.margin
          )[0]
        : null;

    const latestGame =
      games.length > 0
        ? games[0]
        : null;

    const championshipGames =
      games.filter(
        (game) =>
          game.is_championship === true
      );

    const currentStreak =
      getCurrentStreak(games);

    const longestStreak =
      getLongestStreak(games);

    const recentRecord =
      getRecentRecord(games, 5);

    const officialRivalry =
      isOfficialRivalry(
        owner1Name,
        owner2Name
      );

    const article =
      buildMatchupArticle({
        owner1Name,
        owner2Name,
        overall,
        meetings,
        owner1Points,
        owner2Points,
        regularRecord,
        playoffRecord,
        consolationRecord,
        championshipGames,
        biggestWin,
        closestGame,
        latestGame,
        currentStreak,
        longestStreak,
        recentRecord,
        officialRivalry,
      });

    comparison = {
      owner1Name,
      owner2Name,
      games,
      meetings,
      overall,
      regularRecord,
      playoffRecord,
      consolationRecord,
      regularMeetings:
        regularRaw.length,
      playoffMeetings:
        playoffRaw.length,
      consolationMeetings:
        consolationRaw.length,
      championshipGames,
      owner1Points,
      owner2Points,
      owner1Average,
      owner2Average,
      biggestWin,
      closestGame,
      latestGame,
      currentStreak,
      longestStreak,
      officialRivalry,
      article,
    };
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <strong>
            DIRTY P FANTASY FOOTBALL
          </strong>
          <span>LEAGUE ARCHIVE</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            ALL-TIME SERIES
          </p>

          <h1>Head-to-Head</h1>

          <p>
            Pick any two Dirty P owners
            and dig into everything that
            has happened between them.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {ownerList.length}
          </strong>
          <span>OWNERS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>2014–2025</span>
      </nav>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              MATCHUP SEARCH
            </p>
            <h2>Compare Two Owners</h2>
          </div>

          <span>
            Every completed matchup counts
          </span>
        </div>

        <form
          method="GET"
          className="h2h-search-card"
        >
          <div className="h2h-search-field">
            <label htmlFor="owner1">
              OWNER 1
            </label>

            <select
              id="owner1"
              name="owner1"
              defaultValue={
                selectedOwner1 || ""
              }
              required
            >
              <option value="">
                Select owner
              </option>

              {ownerList.map((owner) => (
                <option
                  key={owner.id}
                  value={owner.id}
                >
                  {owner.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h2h-search-vs">
            VS
          </div>

          <div className="h2h-search-field">
            <label htmlFor="owner2">
              OWNER 2
            </label>

            <select
              id="owner2"
              name="owner2"
              defaultValue={
                selectedOwner2 || ""
              }
              required
            >
              <option value="">
                Select owner
              </option>

              {ownerList.map((owner) => (
                <option
                  key={owner.id}
                  value={owner.id}
                >
                  {owner.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="h2h-search-button"
          >
            VIEW MATCHUP
          </button>
        </form>

        {selectedOwner1 ===
          selectedOwner2 && (
          <div className="h2h-error">
            Pick two different owners.
            Unless we're adding an
            existential crisis section.
          </div>
        )}
      </section>

      {comparison && (
        <>
          <section className="owners-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {comparison.officialRivalry
                    ? "🔥 OFFICIAL RIVALRY"
                    : "ALL-TIME MATCHUP"}
                </p>

                <h2>
                  {comparison.owner1Name}
                  {" vs "}
                  {comparison.owner2Name}
                </h2>
              </div>

              <span>
                {comparison.meetings}{" "}
                {comparison.meetings === 1
                  ? "Meeting"
                  : "Meetings"}
              </span>
            </div>

            {comparison.officialRivalry && (
              <div className="h2h-rivalry-banner">
                <span>
                  🔥 RIVALRY WEEK
                </span>
                <strong>
                  OFFICIAL DIRTY P RIVALS
                </strong>
              </div>
            )}

            {comparison.meetings === 0 ? (
              <div className="current-panel">
                <div className="empty-current-state">
                  <strong>
                    No matchups found
                  </strong>
                  <p>
                    These two owners have
                    not played a completed
                    Dirty P matchup in the
                    historical database.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="h2h-series-card h2h-featured-series">
                  <div className="h2h-series-top">
                    <span>
                      {comparison.officialRivalry
                        ? "RIVALRY SERIES"
                        : "ALL-TIME SERIES"}
                    </span>

                    <strong>
                      {comparison.meetings}{" "}
                      MEETINGS
                    </strong>
                  </div>

                  <div className="h2h-series-matchup">
                    <div className="h2h-series-owner">
                      <Link
                        href={`/owners/${selectedOwner1}`}
                      >
                        {
                          comparison.owner1Name
                        }
                      </Link>

                      <strong>
                        {
                          comparison
                            .overall
                            .owner1Wins
                        }
                      </strong>

                      <span>WINS</span>
                    </div>

                    <div className="h2h-series-vs">
                      <span>SERIES</span>

                      <strong>
                        {recordText(
                          comparison
                            .overall
                            .owner1Wins,
                          comparison
                            .overall
                            .owner2Wins,
                          comparison
                            .overall
                            .ties
                        )}
                      </strong>

                      <small>
                        {comparison
                          .overall.ties > 0
                          ? `${
                              comparison
                                .overall
                                .ties
                            } tie${
                              comparison
                                .overall
                                .ties === 1
                                ? ""
                                : "s"
                            }`
                          : "No ties"}
                      </small>
                    </div>

                    <div className="h2h-series-owner right">
                      <Link
                        href={`/owners/${selectedOwner2}`}
                      >
                        {
                          comparison.owner2Name
                        }
                      </Link>

                      <strong>
                        {
                          comparison
                            .overall
                            .owner2Wins
                        }
                      </strong>

                      <span>WINS</span>
                    </div>
                  </div>

                  <div className="h2h-series-stats">
                    <div>
                      <span>
                        {
                          comparison.owner1Name
                        }
                      </span>
                      <strong>
                        {formatScore(
                          comparison.owner1Points
                        )}
                      </strong>
                      <small>
                        TOTAL POINTS
                      </small>
                    </div>

                    <div>
                      <span>
                        AVERAGE SCORE
                      </span>
                      <strong>
                        {formatScore(
                          comparison.owner1Average
                        )}
                        {" – "}
                        {formatScore(
                          comparison.owner2Average
                        )}
                      </strong>
                      <small>
                        ALL MATCHUPS
                      </small>
                    </div>

                    <div>
                      <span>
                        {
                          comparison.owner2Name
                        }
                      </span>
                      <strong>
                        {formatScore(
                          comparison.owner2Points
                        )}
                      </strong>
                      <small>
                        TOTAL POINTS
                      </small>
                    </div>
                  </div>
                </div>

                <div
                  className={`h2h-summary-card ${
                    comparison.officialRivalry
                      ? "h2h-rivalry-summary"
                      : ""
                  }`}
                >
                  <div className="h2h-summary-heading">
                    <span>
                      {comparison.officialRivalry
                        ? "🔥 RIVALRY REPORT"
                        : "MATCHUP REPORT"}
                    </span>

                    <strong>
                      THE STORY SO FAR
                    </strong>
                  </div>

                  <div className="h2h-article-copy">
                    {comparison.article.map(
                      (paragraph, index) => (
                        <p key={index}>
                          {paragraph}
                        </p>
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {comparison.meetings > 0 && (
            <>
              <section className="owners-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      SERIES BREAKDOWN
                    </p>
                    <h2>
                      Head-to-Head Stats
                    </h2>
                  </div>
                </div>

                <div className="record-book-grid">
                  <div className="record-book-card">
                    <span className="record-book-label">
                      Regular Season
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .regularRecord
                          .owner1Wins,
                        comparison
                          .regularRecord
                          .owner2Wins,
                        comparison
                          .regularRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      {
                        comparison.owner1Name
                      }{" "}
                      perspective
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.regularMeetings
                      }{" "}
                      regular-season meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Championship-Bracket
                      Playoffs
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .playoffRecord
                          .owner1Wins,
                        comparison
                          .playoffRecord
                          .owner2Wins,
                        comparison
                          .playoffRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      {
                        comparison.owner1Name
                      }{" "}
                      perspective
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.playoffMeetings
                      }{" "}
                      playoff meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Consolation Games
                    </span>

                    <strong className="record-book-value">
                      {recordText(
                        comparison
                          .consolationRecord
                          .owner1Wins,
                        comparison
                          .consolationRecord
                          .owner2Wins,
                        comparison
                          .consolationRecord
                          .ties
                      )}
                    </strong>

                    <span className="record-book-owner">
                      Counted in overall
                      series
                    </span>

                    <span className="record-book-detail">
                      {
                        comparison.consolationMeetings
                      }{" "}
                      consolation meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Championship Meetings
                    </span>

                    <strong className="record-book-value">
                      {
                        comparison
                          .championshipGames
                          .length
                      }
                    </strong>

                    <span className="record-book-owner">
                      Dirty P Championship
                    </span>

                    <span className="record-book-detail">
                      All-time title-game
                      meetings
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Biggest Win
                    </span>

                    <strong className="record-book-value">
                      {comparison.biggestWin
                        ? formatScore(
                            comparison
                              .biggestWin
                              .margin
                          )
                        : "—"}
                    </strong>

                    <span className="record-book-owner">
                      {comparison.biggestWin
                        ? comparison
                            .biggestWin
                            .owner1Result ===
                          "W"
                          ? comparison.owner1Name
                          : comparison.owner2Name
                        : "No result"}
                    </span>

                    <span className="record-book-detail">
                      {comparison.biggestWin
                        ? `${comparison.biggestWin.season} • Week ${comparison.biggestWin.week}`
                        : ""}
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Closest Game
                    </span>

                    <strong className="record-book-value">
                      {comparison.closestGame
                        ? formatScore(
                            comparison
                              .closestGame
                              .margin
                          )
                        : "—"}
                    </strong>

                    <span className="record-book-owner">
                      Point margin
                    </span>

                    <span className="record-book-detail">
                      {comparison.closestGame
                        ? `${comparison.closestGame.season} • Week ${comparison.closestGame.week}`
                        : ""}
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Current Series Streak
                    </span>

                    <strong className="record-book-value">
                      {comparison
                        .currentStreak
                        ?.count || 0}
                    </strong>

                    <span className="record-book-owner">
                      {comparison
                        .currentStreak
                        ?.owner ===
                      "owner1"
                        ? comparison.owner1Name
                        : comparison
                              .currentStreak
                              ?.owner ===
                            "owner2"
                          ? comparison.owner2Name
                          : "No active streak"}
                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>
                  </div>

                  <div className="record-book-card">
                    <span className="record-book-label">
                      Longest Series
                      Win Streak
                    </span>

                    <strong className="record-book-value">
                      {comparison
                        .longestStreak
                        ?.count || 0}
                    </strong>

                    <span className="record-book-owner">
                      {comparison
                        .longestStreak
                        ?.owner ===
                      "owner1"
                        ? comparison.owner1Name
                        : comparison
                              .longestStreak
                              ?.owner ===
                            "owner2"
                          ? comparison.owner2Name
                          : "—"}
                    </span>

                    <span className="record-book-detail">
                      Consecutive wins
                    </span>
                  </div>
                </div>
              </section>

              <section className="owners-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      GAME LOG
                    </p>
                    <h2>
                      Complete Matchup
                      History
                    </h2>
                  </div>

                  <span>
                    Newest first
                  </span>
                </div>

                <div className="profile-table-wrap">
                  <table className="profile-table matchup-history-table">
                    <thead>
                      <tr>
                        <th>Season</th>
                        <th>Week</th>
                        <th>Type</th>
                        <th>
                          {
                            comparison.owner1Name
                          }
                        </th>
                        <th>Score</th>
                        <th>
                          {
                            comparison.owner2Name
                          }
                        </th>
                        <th>Result</th>
                      </tr>
                    </thead>

                    <tbody>
                      {comparison.games.map(
                        (game, index) => (
                          <tr
                            key={`${game.season}-${game.week}-${index}`}
                          >
                            <td>
                              <strong>
                                {
                                  game.season
                                }
                              </strong>
                            </td>

                            <td>
                              Week {game.week}
                            </td>

                            <td>
                              {game.is_championship
                                ? "Championship"
                                : game.type ===
                                    "playoff"
                                  ? "Playoff"
                                  : game.type ===
                                      "consolation"
                                    ? "Consolation"
                                    : "Regular"}
                            </td>

                            <td>
                              <strong>
                                {
                                  game.owner1Team
                                }
                              </strong>
                            </td>

                            <td>
                              {formatScore(
                                game.owner1Score
                              )}
                              {" – "}
                              {formatScore(
                                game.owner2Score
                              )}
                            </td>

                            <td>
                              <strong>
                                {
                                  game.owner2Team
                                }
                              </strong>
                            </td>

                            <td>
                              <span
                                className={
                                  game.owner1Result ===
                                  "W"
                                    ? "game-win"
                                    : game.owner1Result ===
                                        "L"
                                      ? "game-loss"
                                      : ""
                                }
                              >
                                {
                                  game.owner1Result
                                }
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      <footer className="site-footer">
        <strong>
          DIRTY P FANTASY FOOTBALL
        </strong>

        <p>
          Independent fantasy league
          archive. Not affiliated with or
          endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
