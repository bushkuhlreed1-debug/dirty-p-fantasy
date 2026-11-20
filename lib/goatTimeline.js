// Historical GOAT timeline calculations. Classification and formula intentionally
// match the GOAT Rankings main page and archived playoff win scoring.

const GOAT_POINTS = {
  REGULAR_WIN: 1,
  PLAYOFF_APPEARANCE: 3,
  PLAYOFF_WIN: 4,
  CHAMPIONSHIP_APPEARANCE: 8,
  CHAMPIONSHIP: 12,
};

// ======================================================
// HELPERS
// ======================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatRecord(wins, losses, ties = 0) {
  const w = num(wins);
  const l = num(losses);
  const t = num(ties);

  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function formatNumber(value) {
  return num(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function getWinPct(wins, losses, ties = 0) {
  const total = num(wins) + num(losses) + num(ties);

  if (!total) return 0;

  return ((num(wins) + num(ties) * 0.5) / total) * 100;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// ======================================================
// QUALIFYING GOAT PLAYOFF GAMES
//
// ONLY THESE WINS COUNT:
//
// 1. Semifinal wins
// 2. Championship game wins
//
// NEVER COUNT:
//
// 1. Third-place games
// 2. Consolation bracket games
//
// A generic playoff game is treated as a semifinal
// only if its bracket classification supports the
// four-team championship bracket.
//
// Third-place classification always takes priority.
// ======================================================

function getGoatPlayoffRound(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  const isThirdPlace =
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("thirdplace") ||
    type.includes("3rd_place") ||
    type.includes("3rdplace") ||
    type.includes("bronze");

  if (isThirdPlace) {
    return null;
  }

  const isConsolation =
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    type.includes("toilet") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet");

  if (isConsolation) {
    return null;
  }

  const isChampionship =
    game.is_championship === true ||
    type === "championship" ||
    type === "championship_game" ||
    type === "final" ||
    type === "finals" ||
    type === "title_game";

  if (isChampionship) {
    return "championship";
  }

  const isSemifinal =
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type === "opening_round" ||
    type === "first_round" ||
    type === "round_1";

  if (isSemifinal) {
    return "semifinal";
  }

  // Historical imports may label the opening round
  // simply as "playoff" rather than "semifinal".
  //
  // Within Dirty P's four-team championship bracket,
  // that generic first round is a semifinal.
  //
  // This deliberately does NOT classify every
  // is_playoff=true game as a qualifying victory.

  const genericChampionshipBracket =
    type === "playoff" ||
    type === "playoffs" ||
    type === "winners_bracket" ||
    type === "winner_bracket" ||
    type === "winners_bracket_game";

  const supportedWinnerTier =
    tier === "winners_bracket" ||
    tier === "winner_bracket" ||
    tier === "championship_bracket";

  if (
    genericChampionshipBracket &&
    (
      supportedWinnerTier ||
      game.is_playoff === true
    )
  ) {
    return "semifinal";
  }

  return null;
}

// ======================================================
// ACTUAL PLAYOFF RECORD (NOT THE GOAT POINTS FORMULA)
//
// Like Owner profiles, playoff W-L includes all completed
// championship-bracket games, including third-place games.
// Consolation is never a playoff win/loss. The narrower
// semifinal/championship rules above ONLY award GOAT points.
// ======================================================

function isPlayoffRecordGame(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  // Third-place games are playoff games, even if a legacy
  // import has also marked the game as consolation.
  if (
    game.is_third_place === true ||
    /third_?place|3rd_?place|bronze/.test(type)
  ) return true;

  if (
    game.is_consolation === true ||
    /consolation|loser|toilet/.test(type) ||
    /consolation|loser|toilet/.test(tier)
  ) return false;

  return (
    game.is_playoff === true ||
    game.is_championship === true ||
    /playoff|semifinal|semi_final|championship|title_game|opening_round|first_round/.test(type) ||
    /winner|championship/.test(tier)
  );
}

function isCompletedForPlayoffRecord(game, currentSeason) {
  if (!hasValidScores(game)) return false;
  if (num(game.home_score) === 0 && num(game.away_score) === 0) return false;

  // Older archived games often have final scores but no
  // explicit completed flag. The owner page accepts them.
  if (Number(game.season_year) < Number(currentSeason)) return true;

  return (
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "").trim().toUpperCase() === "FINAL" ||
    ["HOME", "AWAY", "TIE"].includes(String(game.winner || "").trim().toUpperCase())
  );
}

function canonicalGameKey(game) {
  const owners = [
    Number(game.home_owner_id),
    Number(game.away_owner_id),
  ].sort((a, b) => a - b);

  return [
    Number(game.season_year),
    Number(game.matchup_period),
    ...owners,
  ].join(":");
}

// ======================================================
// COMPLETED MATCHUP HELPERS
// ======================================================

function hasValidScores(game) {
  return (
    game.home_score !== null &&
    game.home_score !== undefined &&
    game.home_score !== "" &&
    game.away_score !== null &&
    game.away_score !== undefined &&
    game.away_score !== "" &&
    Number.isFinite(Number(game.home_score)) &&
    Number.isFinite(Number(game.away_score))
  );
}

export function getGameKey(game) {
  return [
    num(game.season_year),
    num(game.matchup_period),
    num(game.home_owner_id),
    num(game.away_owner_id),
  ].join(":");
}

export function isCompletedGame(
  game,
  currentSeason,
  completedKeys
) {
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  const gameSeason = Number(game.season_year);
  const isHistorical =
    Number.isFinite(gameSeason) &&
    gameSeason < Number(currentSeason);

  // Historical imported games may contain an official
  // winner without an explicit completion flag.
  //
  // For live ESPN games, require a completed result.

  if (
    isHistorical &&
    ["HOME", "AWAY", "TIE"].includes(winner)
  ) {
    return true;
  }

  const isFinal =
    game.completed === true ||
    game.is_final === true ||
    String(game.status || "")
      .trim()
      .toUpperCase() === "FINAL" ||
    completedKeys.has(getGameKey(game));

  if (!isFinal) {
    return false;
  }

  if (["HOME", "AWAY", "TIE"].includes(winner)) {
    return true;
  }

  return hasValidScores(game);
}

function getWinnerOwnerId(game) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  if (
    !Number.isFinite(homeId) ||
    !Number.isFinite(awayId) ||
    homeId <= 0 ||
    awayId <= 0 ||
    homeId === awayId
  ) {
    return null;
  }

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") return homeId;
  if (winner === "AWAY") return awayId;
  if (winner === "TIE") return null;

  if (!hasValidScores(game)) {
    return null;
  }

  const homeScore = num(game.home_score);
  const awayScore = num(game.away_score);

  if (homeScore > awayScore) return homeId;
  if (awayScore > homeScore) return awayId;

  return null;
}

// ======================================================
// COUNT ACTUAL SEMIFINAL AND CHAMPIONSHIP WINS
//
// The returned map is the ONLY source used for:
//
// 1. The owner card's displayed number
// 2. The +4 GOAT points per qualifying victory
// ======================================================

function calculateQualifyingWins(games) {
  const records = new Map();

  for (const game of games) {
    const round = getGoatPlayoffRound(game);

    if (
      round !== "semifinal" &&
      round !== "championship"
    ) {
      continue;
    }

    const winnerId = getWinnerOwnerId(game);

    if (!winnerId) {
      continue;
    }

    const existing = records.get(winnerId) || {
      semifinalWins: 0,
      championshipWins: 0,
      total: 0,
    };

    if (round === "semifinal") {
      existing.semifinalWins++;
    }

    if (round === "championship") {
      existing.championshipWins++;
    }

    existing.total =
      existing.semifinalWins +
      existing.championshipWins;

    records.set(winnerId, existing);
  }

  return records;
}

// ======================================================
// ALL-TIME GOAT RANKINGS AT THE END OF EVERY SEASON
//
// Reconstruct each season's ranking from only results
// available through that season. Never credit future titles
// or playoff wins to an earlier historical snapshot.
// ======================================================

export function historicalGoatTimeline({owners,seasonResults,completedGames}) {
  const years=[...new Set(seasonResults.map(s=>Number(s.season_year)))]
    .filter(Number.isFinite).filter(y=>y>=2014)
    .sort((a,b)=>a-b);

  const snapshots=years.map(year=>{
    const eligible=seasonResults.filter(s=>Number(s.season_year)<=year);
    const gamesToDate=completedGames.filter(g=>Number(g.season_year)<=year);
    const winsByOwner=calculateQualifyingWins(gamesToDate);
    const rankings=owners.map(owner=>{
      const ownerSeasons=eligible.filter(s=>Number(s.owner_id)===Number(owner.id));
      if (!ownerSeasons.length) return null;
      const total=field=>ownerSeasons.reduce((sum,s)=>sum+num(s[field]),0);
      const count=field=>ownerSeasons.filter(s=>Boolean(s[field])).length;
      const wins=total("wins"),losses=total("losses"),ties=total("ties");
      const postseasonWins=winsByOwner.get(Number(owner.id))?.total || 0;
      const playoffAppearances=count("playoff_appearance");
      const finals=count("championship_appearance");
      const titles=count("champion");
      const score=
        wins*GOAT_POINTS.REGULAR_WIN +
        playoffAppearances*GOAT_POINTS.PLAYOFF_APPEARANCE +
        postseasonWins*GOAT_POINTS.PLAYOFF_WIN +
        finals*GOAT_POINTS.CHAMPIONSHIP_APPEARANCE +
        titles*GOAT_POINTS.CHAMPIONSHIP;
      return {
        ownerId:Number(owner.id),name:owner.name,score,
        wins,losses,ties,pointsFor:total("points_for"),
        playoffAppearances,postseasonWins,finals,titles,
        winPct:getWinPct(wins,losses,ties)
      };
    }).filter(Boolean);
    rankings.sort((a,b)=>
      b.score-a.score ||
      b.titles-a.titles ||
      b.finals-a.finals ||
      b.postseasonWins-a.postseasonWins ||
      b.wins-a.wins ||
      b.playoffAppearances-a.playoffAppearances ||
      b.winPct-a.winPct ||
      b.pointsFor-a.pointsFor ||
      a.name.localeCompare(b.name)
    );
    return {year,rankings:rankings.map((o,i)=>({
      ownerId:o.ownerId,name:o.name,score:o.score,rank:i+1
    }))};
  });
  return {years,snapshots};
}

