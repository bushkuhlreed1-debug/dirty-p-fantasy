
export async function getEspnLeague() {
  const leagueId = process.env.ESPN_LEAGUE_ID;
  const season = Number(
    process.env.ESPN_SEASON || 2026
  );

  const espnS2 = process.env.ESPN_S2;
  const swid = process.env.ESPN_SWID;

  // =====================================================
  // ENVIRONMENT VARIABLES
  // =====================================================

  if (!leagueId) {
    throw new Error("Missing ESPN_LEAGUE_ID");
  }

  if (!espnS2) {
    throw new Error("Missing ESPN_S2");
  }

  if (!swid) {
    throw new Error("Missing ESPN_SWID");
  }

  // =====================================================
  // ESPN PRIVATE FANTASY API
  // =====================================================

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}` +
    `?view=mTeam` +
    `&view=mStandings` +
    `&view=mSettings` +
    `&view=mStatus` +
    `&view=mMatchupScore`;

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

    console.error(
      "ESPN request failed:",
      response.status,
      body
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        "ESPN authentication failed. ESPN_S2 or ESPN_SWID may need to be refreshed."
      );
    }

    throw new Error(
      `ESPN request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  // =====================================================
  // HELPERS
  // =====================================================

  function num(value) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function validScore(value) {
    return (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    );
  }

  function getTeamScore(side) {
    if (!side) return null;

    const score = side.totalPoints;

    return validScore(score) ? Number(score) : null;
  }

  // =====================================================
  // ESPN MEMBER LOOKUP
  // =====================================================

  const memberMap = new Map();

  for (const member of data.members || []) {
    const fullName = [
      member.firstName,
      member.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const name =
      fullName ||
      member.displayName ||
      "Unknown Owner";

    memberMap.set(member.id, {
      espnOwnerId: member.id,
      ownerName: name,
      displayName: member.displayName || name,
    });
  }

  // =====================================================
  // DIVISIONS
  // =====================================================

  const divisionMap = new Map();

  const divisions =
    data.settings?.scheduleSettings?.divisions || [];

  for (const division of divisions) {
    divisionMap.set(
      Number(division.id),
      division.name
    );
  }

  // =====================================================
  // LEAGUE SETTINGS
  // =====================================================

  const scheduleSettings =
    data.settings?.scheduleSettings || {};

  const playoffTeamCount =
    num(scheduleSettings.playoffTeamCount) || 4;

  const regularSeasonMatchupCount =
    num(scheduleSettings.matchupPeriodCount) || 14;

  const playoffMatchupPeriodLength =
    num(
      scheduleSettings.playoffMatchupPeriodLength
    ) || 1;

  // =====================================================
  // CURRENT WEEK / SCORING PERIOD
  // =====================================================

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

  // =====================================================
  // NORMALIZE TEAMS
  // =====================================================

  const teams = (data.teams || []).map((team) => {
    const espnOwnerId =
      team.primaryOwner ||
      team.owners?.[0] ||
      team.ownerId ||
      null;

    const member = memberMap.get(espnOwnerId);

    const record = team.record?.overall || {};

    const teamName =
      team.name ||
      [
        team.location,
        team.nickname,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      team.abbrev ||
      `Team ${team.id}`;

    return {
      espnTeamId: num(team.id),

      espnOwnerId,

      ownerName:
        member?.ownerName || "Unknown Owner",

      ownerDisplayName:
        member?.displayName || "Unknown Owner",

      teamName,

      abbreviation: team.abbrev || null,

      wins: num(record.wins),

      losses: num(record.losses),

      ties: num(record.ties),

      pointsFor: num(
        record.pointsFor ?? team.points
      ),

      pointsAgainst: num(
        record.pointsAgainst ?? team.pointsAgainst
      ),

      playoffSeed: num(team.playoffSeed),

      finalRank: num(team.rankCalculatedFinal),

      divisionId:
        team.divisionId != null
          ? Number(team.divisionId)
          : null,

      divisionName:
        divisionMap.get(
          Number(team.divisionId)
        ) || null,
    };
  });

  // =====================================================
  // TEAM LOOKUP
  // =====================================================

  const teamMap = new Map();

  for (const team of teams) {
    teamMap.set(team.espnTeamId, team);
  }

  // =====================================================
  // SORT STANDINGS
  // =====================================================

  teams.sort((a, b) => {
    if (
      a.playoffSeed > 0 &&
      b.playoffSeed > 0 &&
      a.playoffSeed !== b.playoffSeed
    ) {
      return a.playoffSeed - b.playoffSeed;
    }

    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }

    if (b.ties !== a.ties) {
      return b.ties - a.ties;
    }

    return b.pointsFor - a.pointsFor;
  });

  // =====================================================
  // RAW ESPN SCHEDULE
  // =====================================================

  const rawSchedule = Array.isArray(data.schedule)
    ? data.schedule
    : [];

  const matchupPeriods = rawSchedule
    .map((matchup) =>
      Number(matchup.matchupPeriodId)
    )
    .filter(
      (period) =>
        Number.isFinite(period) &&
        period > 0
    );

  const finalMatchupPeriod =
    matchupPeriods.length > 0
      ? Math.max(...matchupPeriods)
      : regularSeasonMatchupCount;

  // =====================================================
  // FIRST PASS: NORMALIZE ESPN MATCHUPS
  // =====================================================

  const matchups = rawSchedule
    .map((matchup) => {
      const homeTeamId = num(
        matchup.home?.teamId
      );

      const awayTeamId = num(
        matchup.away?.teamId
      );

      const homeTeam = teamMap.get(homeTeamId);

      const awayTeam = teamMap.get(awayTeamId);

      const matchupPeriod = num(
        matchup.matchupPeriodId
      );

      const homeScore = getTeamScore(
        matchup.home
      );

      const awayScore = getTeamScore(
        matchup.away
      );

      const winner = String(
        matchup.winner || "UNDECIDED"
      )
        .trim()
        .toUpperCase();

      const playoffTierType = String(
        matchup.playoffTierType || "NONE"
      )
        .trim()
        .toUpperCase();

      // -------------------------------------------------
      // CONSOLATION
      // -------------------------------------------------

      const isConsolation =
        playoffTierType.includes("LOSER") ||
        playoffTierType.includes("CONSOLATION") ||
        playoffTierType.includes("TOILET");

      // -------------------------------------------------
      // WINNERS BRACKET
      // -------------------------------------------------

      const isWinnersBracket =
        playoffTierType === "WINNERS_BRACKET";

      // -------------------------------------------------
      // PLAYOFFS
      // -------------------------------------------------

      const isPlayoff =
        matchupPeriod > regularSeasonMatchupCount ||
        isWinnersBracket ||
        isConsolation;

      // -------------------------------------------------
      // OFFICIAL COMPLETION
      //
      // An undecided matchup must not enter league
      // history, even if scores are already available.
      // -------------------------------------------------

      const hasOfficialResult =
        winner === "HOME" ||
        winner === "AWAY" ||
        winner === "TIE";

      const hasBothTeams =
        homeTeamId > 0 &&
        awayTeamId > 0;

      const hasBothScores =
        validScore(homeScore) &&
        validScore(awayScore);

      const completed =
        hasOfficialResult &&
        hasBothTeams &&
        hasBothScores;

      return {
        espnMatchupId: matchup.id,

        season,

        matchupPeriod,

        homeEspnTeamId: homeTeamId,

        awayEspnTeamId: awayTeamId,

        homeEspnOwnerId:
          homeTeam?.espnOwnerId || null,

        awayEspnOwnerId:
          awayTeam?.espnOwnerId || null,

        homeOwnerName:
          homeTeam?.ownerName ||
          "Unknown Owner",

        awayOwnerName:
          awayTeam?.ownerName ||
          "Unknown Owner",

        homeTeamName:
          homeTeam?.teamName ||
          `Team ${homeTeamId}`,

        awayTeamName:
          awayTeam?.teamName ||
          `Team ${awayTeamId}`,

        homeScore,

        awayScore,

        winner,

        playoffTierType,

        isPlayoff,

        isConsolation,

        isWinnersBracket,

        completed,

        // Determined after inspecting the full bracket.
        possibleChampionship: false,

        isThirdPlace: false,
      };
    })
    .filter(
      (matchup) =>
        matchup.matchupPeriod > 0
    );

  // =====================================================
  // CHAMPIONSHIP IDENTIFICATION
  //
  // We identify the final winners-bracket period.
  //
  // If there is exactly one distinct matchup in that
  // period, it can be treated as the championship.
  //
  // If ESPN returns multiple possible finalists,
  // do not guess or award a championship.
  // =====================================================

  const winnersBracketMatchups = matchups.filter(
    (matchup) =>
      matchup.isWinnersBracket &&
      !matchup.isConsolation
  );

  const winnersBracketPeriods =
    winnersBracketMatchups.map(
      (matchup) => matchup.matchupPeriod
    );

  const finalWinnersBracketPeriod =
    winnersBracketPeriods.length > 0
      ? Math.max(...winnersBracketPeriods)
      : null;

  const finalWinnersBracketGames =
    finalWinnersBracketPeriod !== null
      ? winnersBracketMatchups.filter(
          (matchup) =>
            matchup.matchupPeriod ===
            finalWinnersBracketPeriod
        )
      : [];

  // A championship could potentially span multiple
  // ESPN schedule entries. Only assign a championship
  // when the final round is unambiguous.

  const uniqueFinalMatchups = new Map();

  for (const matchup of finalWinnersBracketGames) {
    const key =
      matchup.espnMatchupId != null
        ? `id:${matchup.espnMatchupId}`
        : [
            matchup.matchupPeriod,
            Math.min(
              matchup.homeEspnTeamId,
              matchup.awayEspnTeamId
            ),
            Math.max(
              matchup.homeEspnTeamId,
              matchup.awayEspnTeamId
            ),
          ].join(":");

    uniqueFinalMatchups.set(key, matchup);
  }

  const finalCandidates = [
    ...uniqueFinalMatchups.values(),
  ];

  if (finalCandidates.length === 1) {
    const championship = finalCandidates[0];

    // Mark matching schedule entries.
    for (const matchup of matchups) {
      if (
        matchup.espnMatchupId ===
        championship.espnMatchupId
      ) {
        matchup.possibleChampionship = true;
      }
    }
  } else if (finalCandidates.length > 1) {
    console.warn(
      "ESPN championship identification is ambiguous:",
      finalCandidates.map((matchup) => ({
        matchupId: matchup.espnMatchupId,
        period: matchup.matchupPeriod,
        home: matchup.homeTeamName,
        away: matchup.awayTeamName,
      }))
    );
  }

  // =====================================================
  // COMPLETED MATCHUPS
  // =====================================================

  const completedMatchups = matchups.filter(
    (matchup) => matchup.completed
  );

  // =====================================================
  // COMPLETED REGULAR SEASON
  // =====================================================

  const completedRegularSeasonMatchups =
    completedMatchups.filter(
      (matchup) => !matchup.isPlayoff
    );

  // =====================================================
  // COMPLETED CHAMPIONSHIP BRACKET
  // =====================================================

  const completedPlayoffMatchups =
    completedMatchups.filter(
      (matchup) =>
        matchup.isPlayoff &&
        !matchup.isConsolation
    );

  // =====================================================
  // COMPLETED CONSOLATION BRACKET
  // =====================================================

  const completedConsolationMatchups =
    completedMatchups.filter(
      (matchup) => matchup.isConsolation
    );

  // =====================================================
  // RETURN ESPN LEAGUE DATA
  //
  // Preserve the field names expected by leagueData.js.
  // =====================================================

  return {
    leagueName:
      data.settings?.name ||
      "Dirty P Fantasy Football",

    season,

    currentWeek,

    currentScoringPeriod,

    latestScoringPeriod,

    finalScoringPeriod,

    playoffTeamCount,

    regularSeasonMatchupCount,

    playoffMatchupPeriodLength,

    finalMatchupPeriod,

    finalWinnersBracketPeriod,

    championshipIdentified:
      finalCandidates.length === 1,

    teams,

    matchups,

    completedMatchups,

    completedRegularSeasonMatchups,

    completedPlayoffMatchups,

    completedConsolationMatchups,
  };
}
