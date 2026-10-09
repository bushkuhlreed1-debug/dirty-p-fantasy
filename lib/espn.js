
export async function getEspnLeague() {
  const leagueId = process.env.ESPN_LEAGUE_ID;
  const season = Number(process.env.ESPN_SEASON || 2026);
  const espnS2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;

  if (!leagueId) throw new Error("Missing ESPN_LEAGUE_ID");
  if (!espnS2) throw new Error("Missing ESPN_S2");
  if (!swid) throw new Error("Missing ESPN_SWID");

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    "?view=mTeam&view=mStandings&view=mSettings&view=mStatus&view=mMatchupScore";

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("ESPN request failed:", response.status, body);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "ESPN authentication failed. Refresh ESPN_S2 or ESPN_SWID."
      );
    }

    throw new Error(`ESPN request failed: ${response.status}`);
  }

  const data = await response.json();

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function score(value) {
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

  function gameWinnerId(game) {
    if (!game?.completed) return null;
    if (game.winner === "HOME") return game.homeEspnTeamId;
    if (game.winner === "AWAY") return game.awayEspnTeamId;
    return null;
  }

  function gamePairKey(game) {
    if (
      !game ||
      !(game.homeEspnTeamId > 0) ||
      !(game.awayEspnTeamId > 0)
    ) {
      return null;
    }

    return [
      Math.min(game.homeEspnTeamId, game.awayEspnTeamId),
      Math.max(game.homeEspnTeamId, game.awayEspnTeamId),
    ].join(":");
  }

  // ====================================================
  // ESPN OWNERS
  // ====================================================

  const memberMap = new Map();

  for (const member of data.members || []) {
    const fullName = [
      member.firstName,
      member.lastName,
    ].filter(Boolean).join(" ").trim();

    const ownerName =
      fullName || member.displayName || "Unknown Owner";

    memberMap.set(member.id, {
      espnOwnerId: member.id,
      ownerName,
      displayName: member.displayName || ownerName,
    });
  }

  // ====================================================
  // LEAGUE SETTINGS
  // ====================================================

  const scheduleSettings = data.settings?.scheduleSettings || {};
  const divisionMap = new Map();

  for (const division of scheduleSettings.divisions || []) {
    divisionMap.set(Number(division.id), division.name);
  }

  const playoffTeamCount =
    num(scheduleSettings.playoffTeamCount) || 4;

  const regularSeasonMatchupCount =
    num(scheduleSettings.matchupPeriodCount) || 14;

  const playoffMatchupPeriodLength =
    num(scheduleSettings.playoffMatchupPeriodLength) || 1;

  const currentWeek = num(
    data.status?.currentMatchupPeriod ??
    data.scoringPeriodId ??
    1
  );

  const currentScoringPeriod = num(
    data.status?.currentScoringPeriod ??
    data.scoringPeriodId ??
    currentWeek
  );

  const latestScoringPeriod = num(
    data.status?.latestScoringPeriod ??
    currentScoringPeriod
  );

  const finalScoringPeriod = num(
    data.status?.finalScoringPeriod ?? 18
  );

  // ====================================================
  // TEAMS
  // ====================================================

  const teams = (data.teams || []).map((team) => {
    const espnOwnerId =
      team.primaryOwner || team.owners?.[0] || team.ownerId || null;

    const member = memberMap.get(espnOwnerId);
    const record = team.record?.overall || {};

    const teamName =
      team.name ||
      [team.location, team.nickname].filter(Boolean).join(" ").trim() ||
      team.abbrev ||
      `Team ${team.id}`;

    return {
      espnTeamId: num(team.id),
      espnOwnerId,
      ownerName: member?.ownerName || "Unknown Owner",
      ownerDisplayName:
        member?.displayName || "Unknown Owner",
      teamName,
      abbreviation: team.abbrev || null,
      wins: num(record.wins),
      losses: num(record.losses),
      ties: num(record.ties),
      pointsFor: num(record.pointsFor ?? team.points),
      pointsAgainst: num(
        record.pointsAgainst ?? team.pointsAgainst
      ),
      playoffSeed: num(team.playoffSeed),
      finalRank: num(team.rankCalculatedFinal),
      divisionId:
        team.divisionId == null ? null : Number(team.divisionId),
      divisionName:
        divisionMap.get(Number(team.divisionId)) || null,
    };
  });

  const teamMap = new Map(
    teams.map((team) => [team.espnTeamId, team])
  );

  teams.sort((a, b) => {
    if (
      a.playoffSeed > 0 &&
      b.playoffSeed > 0 &&
      a.playoffSeed !== b.playoffSeed
    ) {
      return a.playoffSeed - b.playoffSeed;
    }

    return (
      b.wins - a.wins ||
      b.ties - a.ties ||
      b.pointsFor - a.pointsFor
    );
  });

  // ====================================================
  // ESPN SCHEDULE
  // ====================================================

  const rawSchedule = Array.isArray(data.schedule)
    ? data.schedule
    : [];

  const matchupPeriods = rawSchedule
    .map((game) => Number(game.matchupPeriodId))
    .filter((period) => Number.isFinite(period) && period > 0);

  const finalMatchupPeriod = matchupPeriods.length
    ? Math.max(...matchupPeriods)
    : regularSeasonMatchupCount;

  const matchups = rawSchedule
    .map((game) => {
      const homeEspnTeamId = num(game.home?.teamId);
      const awayEspnTeamId = num(game.away?.teamId);

      const homeTeam = teamMap.get(homeEspnTeamId);
      const awayTeam = teamMap.get(awayEspnTeamId);
      const matchupPeriod = num(game.matchupPeriodId);

      const homeScore = score(game.home?.totalPoints);
      const awayScore = score(game.away?.totalPoints);

      const winner = String(
        game.winner || "UNDECIDED"
      ).trim().toUpperCase();

      const playoffTierType = String(
        game.playoffTierType || "NONE"
      ).trim().toUpperCase();

      const isConsolation =
        playoffTierType.includes("LOSER") ||
        playoffTierType.includes("CONSOLATION") ||
        playoffTierType.includes("TOILET");

      const isWinnersBracket =
        playoffTierType === "WINNERS_BRACKET";

      const isPlayoff =
        matchupPeriod > regularSeasonMatchupCount ||
        isWinnersBracket ||
        isConsolation;

      const hasOfficialResult =
        winner === "HOME" ||
        winner === "AWAY" ||
        winner === "TIE";

      const completed =
        hasOfficialResult &&
        homeEspnTeamId > 0 &&
        awayEspnTeamId > 0 &&
        homeScore !== null &&
        awayScore !== null;

      return {
        espnMatchupId: game.id,
        season,
        matchupPeriod,
        homeEspnTeamId,
        awayEspnTeamId,
        homeEspnOwnerId: homeTeam?.espnOwnerId || null,
        awayEspnOwnerId: awayTeam?.espnOwnerId || null,
        homeOwnerName: homeTeam?.ownerName || "Unknown Owner",
        awayOwnerName: awayTeam?.ownerName || "Unknown Owner",
        homeTeamName:
          homeTeam?.teamName || `Team ${homeEspnTeamId}`,
        awayTeamName:
          awayTeam?.teamName || `Team ${awayEspnTeamId}`,
        homeScore,
        awayScore,
        winner,
        playoffTierType,
        isPlayoff,
        isConsolation,
        isWinnersBracket,
        completed,
        isSemifinal: false,
        possibleChampionship: false,
        isThirdPlace: false,
      };
    })
    .filter((game) => game.matchupPeriod > 0);

  // ====================================================
  // FIND SEMIFINALS
  //
  // Your league has 4 playoff teams and two semifinals.
  // The winners advance to the championship.
  //
  // We only accept a semifinal round with exactly
  // two distinct pairings involving four teams.
  // ====================================================

  const winnersBracketGames = matchups.filter(
    (game) =>
      game.isWinnersBracket &&
      !game.isConsolation &&
      game.homeEspnTeamId > 0 &&
      game.awayEspnTeamId > 0
  );

  const playoffPeriods = [
    ...new Set(
      winnersBracketGames.map((game) => game.matchupPeriod)
    ),
  ].sort((a, b) => a - b);

  let semifinalPeriod = null;
  let semifinalGames = [];

  for (const period of playoffPeriods) {
    const periodGames = winnersBracketGames.filter(
      (game) => game.matchupPeriod === period
    );

    const uniqueGames = new Map();

    for (const game of periodGames) {
      const pair = gamePairKey(game);

      if (pair) uniqueGames.set(pair, game);
    }

    const candidates = [...uniqueGames.values()];
    const participantIds = new Set(
      candidates.flatMap((game) => [
        game.homeEspnTeamId,
        game.awayEspnTeamId,
      ])
    );

    if (candidates.length === 2 && participantIds.size === 4) {
      semifinalPeriod = period;
      semifinalGames = candidates;
      break;
    }
  }

  for (const game of matchups) {
    if (
      semifinalPeriod !== null &&
      game.matchupPeriod === semifinalPeriod &&
      semifinalGames.some(
        (semifinal) =>
          gamePairKey(semifinal) === gamePairKey(game)
      )
    ) {
      game.isSemifinal = true;
    }
  }

  // ====================================================
  // FIND THE TWO SEMIFINAL WINNERS
  // ====================================================

  const semifinalWinnerIds = semifinalGames
    .map(gameWinnerId)
    .filter((id) => id !== null);

  const hasTwoFinalists =
    semifinalGames.length === 2 &&
    semifinalWinnerIds.length === 2 &&
    new Set(semifinalWinnerIds).size === 2;

  const championshipFinalistTeamIds = hasTwoFinalists
    ? semifinalWinnerIds
    : [];

  // ====================================================
  // IDENTIFY THE CHAMPIONSHIP BY ITS PARTICIPANTS
  //
  // Do not mistake a third-place matchup for the final.
  // The final must contain both semifinal winners.
  // ====================================================

  let championshipMatchup = null;
  let championshipIdentified = false;

  if (hasTwoFinalists) {
    const finalistPair = [
      ...championshipFinalistTeamIds,
    ].sort((a, b) => a - b).join(":");

    const matchingGames = matchups.filter(
      (game) =>
        game.matchupPeriod > semifinalPeriod &&
        !game.isConsolation &&
        gamePairKey(game) === finalistPair
    );

    const distinctPairs = new Map();

    for (const game of matchingGames) {
      // One championship pairing is expected.
      // Multiple schedule entries for the same
      // matchup may represent ESPN scoring periods.
      const key =
        game.espnMatchupId != null
          ? String(game.espnMatchupId)
          : `${game.matchupPeriod}:${gamePairKey(game)}`;

      distinctPairs.set(key, game);
    }

    if (distinctPairs.size === 1) {
      championshipMatchup = [...distinctPairs.values()][0];
      championshipIdentified = true;

      for (const game of matchups) {
        if (
          game.espnMatchupId ===
          championshipMatchup.espnMatchupId
        ) {
          game.possibleChampionship = true;
        }
      }
    }
  }

  // ====================================================
  // MARK THIRD-PLACE GAME
  //
  // The two losing semifinal teams can meet for third.
  // That game does not decide the champion.
  // ====================================================

  const semifinalLoserIds = semifinalGames
    .filter((game) => game.completed)
    .map((game) => {
      const winnerId = gameWinnerId(game);
      if (!winnerId) return null;

      return winnerId === game.homeEspnTeamId
        ? game.awayEspnTeamId
        : game.homeEspnTeamId;
    })
    .filter((id) => id !== null);

  if (
    semifinalLoserIds.length === 2 &&
    semifinalPeriod !== null
  ) {
    const loserPair = [...semifinalLoserIds]
      .sort((a, b) => a - b)
      .join(":");

    for (const game of matchups) {
      if (
        game.matchupPeriod > semifinalPeriod &&
        gamePairKey(game) === loserPair
      ) {
        game.isThirdPlace = true;
      }
    }
  }

  // ====================================================
  // COMPLETED GAME GROUPS
  // ====================================================

  const completedMatchups = matchups.filter(
    (game) => game.completed
  );

  const completedRegularSeasonMatchups =
    completedMatchups.filter(
      (game) => !game.isPlayoff
    );

  const completedPlayoffMatchups =
    completedMatchups.filter(
      (game) =>
        game.isPlayoff &&
        !game.isConsolation
    );

  const completedConsolationMatchups =
    completedMatchups.filter(
      (game) => game.isConsolation
    );

  // ====================================================
  // RETURN ESPN DATA
  // ====================================================

  return {
    leagueName:
      data.settings?.name || "Dirty P Fantasy Football",
    season,
    currentWeek,
    currentScoringPeriod,
    latestScoringPeriod,
    finalScoringPeriod,
    playoffTeamCount,
    regularSeasonMatchupCount,
    playoffMatchupPeriodLength,
    finalMatchupPeriod,

    semifinalPeriod,
    semifinalGames,
    semifinalWinnerIds,
    championshipFinalistTeamIds,
    championshipIdentified,
    championshipMatchup,

    teams,
    matchups,
    completedMatchups,
    completedRegularSeasonMatchups,
    completedPlayoffMatchups,
    completedConsolationMatchups,
  };
}
