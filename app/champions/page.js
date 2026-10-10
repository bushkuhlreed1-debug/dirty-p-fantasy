import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// =====================================================
// HELPERS
// =====================================================

const n = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const valid = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const fmt = (value, digits = 2) =>
  n(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const norm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

function gamesPlayed(row) {
  return (
    n(row?.wins) +
    n(row?.losses) +
    n(row?.ties)
  );
}

function winPct(row) {
  const total = gamesPlayed(row);

  if (!total) return null;

  return (
    (n(row.wins) + n(row.ties) / 2) /
    total
  );
}

function record(row) {
  if (!row) return "—";

  const base = `${n(row.wins)}-${n(row.losses)}`;

  return n(row.ties)
    ? `${base}-${n(row.ties)}`
    : base;
}

function signed(value, digits = 2) {
  if (!valid(value)) return "—";

  return `${n(value) >= 0 ? "+" : ""}${fmt(
    value,
    digits
  )}`;
}

// =====================================================
// LOAD ALL HISTORICAL ROWS
// =====================================================

async function fetchAll(table) {
  const rows = [];

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", {
        ascending: true,
      })
      .range(offset, offset + 499);

    if (error) throw new Error(error.message);

    rows.push(...(data || []));

    if (!data || data.length < 500) {
      break;
    }
  }

  return rows;
}

// =====================================================
// MATCHUP HELPERS
// =====================================================

function winnerId(game) {
  if (
    !valid(game.home_score) ||
    !valid(game.away_score)
  ) {
    return null;
  }

  const winner = String(
    game.winner || ""
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

  if (n(game.home_score) > n(game.away_score)) {
    return n(game.home_owner_id);
  }

  if (n(game.away_score) > n(game.home_score)) {
    return n(game.away_owner_id);
  }

  return null;
}

function winningMargin(game, ownerId) {
  if (
    !game ||
    winnerId(game) !== ownerId
  ) {
    return null;
  }

  return Math.abs(
    n(game.home_score) -
    n(game.away_score)
  );
}

function playedBy(game, ownerId) {
  return (
    n(game.home_owner_id) === ownerId ||
    n(game.away_owner_id) === ownerId
  );
}

function roundOf(game) {
  const type = norm(game.matchup_type);
  const tier = norm(game.playoff_tier);

  // Third-place games are postseason games,
  // but they do not count as semifinals.
  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place")
  ) {
    return "third_place";
  }

  if (
    type.includes("consolation") ||
    type.includes("loser") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return "consolation";
  }

  if (
    game.is_championship === true ||
    [
      "championship",
      "championship_game",
      "title_game",
      "final",
    ].includes(type)
  ) {
    return "championship";
  }

  if (
    type.includes("semifinal") ||
    type.includes("semi_final")
  ) {
    return "semifinal";
  }

  if (
    [
      "playoff",
      "playoffs",
      "opening_round",
      "first_round",
    ].includes(type) ||
    (
      game.is_playoff === true &&
      [
        "winners_bracket",
        "winner_bracket",
        "championship_bracket",
      ].includes(tier)
    )
  ) {
    return "playoff";
  }

  return "regular";
}

function matchupWeek(game) {
  return n(
    game.matchup_period ??
    game.scoring_period_start
  );
}

function scoringWeeks(game) {
  if (
    valid(game.scoring_period_start) &&
    valid(game.scoring_period_end)
  ) {
    return Math.max(
      1,
      n(game.scoring_period_end) -
        n(game.scoring_period_start) +
        1
    );
  }

  return 1;
}

// =====================================================
// CALCULATE EACH CHAMPIONSHIP SEASON
// =====================================================

function calculateSeasons(
  seasons,
  results,
  matchups
) {
  return seasons.map((season) => {
    const year = n(season.year);
    const ownerId = n(season.champion?.id);

    const leagueResults = results.filter(
      (row) =>
        n(row.season_year) === year
    );

    const championResult = leagueResults.find(
      (row) =>
        n(row.owner_id) === ownerId
    );

    // ---------------------------------------------
    // AVERAGE SCORING FOR THAT SEASON
    //
    // This accounts for the differences between
    // standard scoring and full PPR without
    // needing the exact year settings changed.
    // ---------------------------------------------

    const scoredTeams = leagueResults.filter(
      (row) =>
        gamesPlayed(row) > 0 &&
        valid(row.points_for) &&
        valid(row.points_against)
    );

    const totalLeaguePoints = scoredTeams.reduce(
      (sum, row) =>
        sum + n(row.points_for),
      0
    );

    const totalLeagueGames = scoredTeams.reduce(
      (sum, row) =>
        sum + gamesPlayed(row),
      0
    );

    const leagueAverage =
      totalLeagueGames > 0
        ? totalLeaguePoints /
          totalLeagueGames
        : null;

    // ---------------------------------------------
    // REGULAR SEASON
    // ---------------------------------------------

    const totalGames =
      gamesPlayed(championResult);

    const winningPercentage =
      championResult && totalGames
        ? winPct(championResult) * 100
        : null;

    const totalPointDifferential =
      championResult &&
      valid(championResult.points_for) &&
      valid(championResult.points_against)
        ? n(championResult.points_for) -
          n(championResult.points_against)
        : null;

    const avgPointDifferential =
      totalPointDifferential !== null &&
      totalGames > 0
        ? totalPointDifferential /
          totalGames
        : null;

    // Average differential as a percentage of
    // that season's league-average team score.
    //
    // Example:
    // +30 PPG with a league average of 100
    // = +30% regular-season dominance.
    //
    // This includes both wins and losses.
    const regularDominance =
      avgPointDifferential !== null &&
      leagueAverage > 0
        ? (
            avgPointDifferential /
            leagueAverage
          ) * 100
        : null;

    // ---------------------------------------------
    // PLAYOFF MATCHUPS
    // ---------------------------------------------

    const ownerGames = matchups.filter(
      (game) =>
        n(game.season_year) === year &&
        playedBy(game, ownerId)
    );

    const championshipGames = ownerGames
      .filter(
        (game) =>
          roundOf(game) ===
            "championship" &&
          winnerId(game) === ownerId
      )
      .sort(
        (a, b) =>
          matchupWeek(b) -
          matchupWeek(a)
      );

    const championship =
      championshipGames[0] || null;

    // Some historical semifinal matchups are
    // labeled simply "playoff".
    //
    // Find the latest winners-bracket victory
    // BEFORE the championship.
    const semifinalCandidates = ownerGames
      .filter((game) => {
        const type = roundOf(game);

        return (
          (type === "semifinal" ||
            type === "playoff") &&
          winnerId(game) === ownerId &&
          championship &&
          matchupWeek(game) <
            matchupWeek(championship)
        );
      })
      .sort(
        (a, b) =>
          matchupWeek(b) -
          matchupWeek(a)
      );

    const semifinal =
      semifinalCandidates[0] || null;

    const semifinalMargin =
      semifinal
        ? winningMargin(
            semifinal,
            ownerId
          )
        : null;

    const championshipMargin =
      championship
        ? winningMargin(
            championship,
            ownerId
          )
        : null;

    const combinedPlayoffMargin =
      semifinalMargin !== null &&
      championshipMargin !== null
        ? semifinalMargin +
          championshipMargin
        : null;

    // Normalize combined playoff margins by
    // the league-average team score for the
    // number of scoring weeks in both rounds.
    //
    // This allows different scoring eras to
    // be compared more fairly.
    const playoffScoringWeeks =
      semifinal && championship
        ? scoringWeeks(semifinal) +
          scoringWeeks(championship)
        : null;

    const playoffDominance =
      combinedPlayoffMargin !== null &&
      leagueAverage > 0 &&
      playoffScoringWeeks > 0
        ? (
            combinedPlayoffMargin /
            (
              leagueAverage *
              playoffScoringWeeks
            )
          ) * 100
        : null;

    // ---------------------------------------------
    // ELIGIBILITY
    // ---------------------------------------------

    const complete =
      Boolean(championResult) &&
      totalGames > 0 &&
      scoredTeams.length >= 2 &&
      leagueAverage > 0 &&
      winningPercentage !== null &&
      regularDominance !== null &&
      playoffDominance !== null;

    return {
      season,
      year,
      ownerId,

      championResult,
      complete,

      record: record(championResult),
      wins: n(championResult?.wins),

      winningPercentage,
      avgPointDifferential,
      regularDominance,

      semifinalMargin,
      championshipMargin,
      combinedPlayoffMargin,
      playoffDominance,

      leagueAverage,

      winRank: null,
      regularRank: null,
      playoffRank: null,
      rankTotal: null,
      overallRank: null,
    };
  });
}

// =====================================================
// CATEGORY RANKING
//
// First = 1 point
// Second = 2 points
// Third = 3 points
// ...
//
// Tied statistics receive average ranks.
//
// Lower total rank = better championship season.
// =====================================================

function assignRanks(
  rows,
  field,
  destination
) {
  const sorted = [...rows].sort(
    (a, b) =>
      n(b[field]) -
      n(a[field])
  );

  let position = 0;

  while (position < sorted.length) {
    let end = position + 1;

    while (
      end < sorted.length &&
      Math.abs(
        n(sorted[end][field]) -
        n(sorted[position][field])
      ) < 0.0000001
    ) {
      end++;
    }

    // Positions are 1-based.
    //
    // Example:
    // Tied second/third = 2.5 each.
    const averageRank =
      (
        (position + 1) +
        end
      ) / 2;

    for (
      let index = position;
      index < end;
      index++
    ) {
      sorted[index][destination] =
        averageRank;
    }

    position = end;
  }
}

function buildRankings(
  seasons,
  results,
  matchups
) {
  const all = calculateSeasons(
    seasons,
    results,
    matchups
  );

  const eligible = all.filter(
    (row) => row.complete
  );

  // Three equally important categories:
  //
  // 1. Regular-season winning percentage
  // 2. Scoring-adjusted regular-season differential
  // 3. Scoring-adjusted playoff victory margin
  //
  // Each contributes one rank number.

  assignRanks(
    eligible,
    "winningPercentage",
    "winRank"
  );

  assignRanks(
    eligible,
    "regularDominance",
    "regularRank"
  );

  assignRanks(
    eligible,
    "playoffDominance",
    "playoffRank"
  );

  eligible.forEach((row) => {
    row.rankTotal =
      row.winRank +
      row.regularRank +
      row.playoffRank;
  });

  // Overall ranking:
  //
  // Lowest combined rank wins.
  //
  // Exact rank-total ties are broken by:
  // 1. Better regular-season dominance
  // 2. Better playoff dominance
  // 3. Better winning percentage
  // 4. Earlier season

  eligible.sort(
    (a, b) =>
      a.rankTotal - b.rankTotal ||
      b.regularDominance -
        a.regularDominance ||
      b.playoffDominance -
        a.playoffDominance ||
      b.winningPercentage -
        a.winningPercentage ||
      a.year - b.year
  );

  eligible.forEach((row, index) => {
    row.overallRank = index + 1;
  });

  return {
    ranked: eligible,
    incomplete: all.filter(
      (row) => !row.complete
    ),
  };
}

// =====================================================
// STAT DISPLAY
// =====================================================

function Stat({
  label,
  value,
  detail,
}) {
  return (
    <div className="dp-ranking-stat">
      <strong>{value}</strong>
      <span>{label}</span>

      {detail && <small>{detail}</small>}
    </div>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================

export default async function ChampionsPage() {
  let seasons = [];
  let teams = [];
  let results = [];
  let games = [];

  try {
    const [
      seasonResponse,
      teamResponse,
      resultRows,
      gameRows,
    ] = await Promise.all([
      supabase
        .from("seasons")
        .select(`
          year,
          championship_score,
          champion:champion_owner_id(
            id,
            name
          ),
          runner_up:runner_up_owner_id(
            id,
            name
          )
        `)
        .lt("year", CURRENT_SEASON)
        .order("year", {
          ascending: false,
        }),

      supabase
        .from("teams")
        .select(`
          season_year,
          owner_id,
          team_name
        `)
        .lt(
          "season_year",
          CURRENT_SEASON
        ),

      fetchAll("season_results"),

      fetchAll("matchups"),
    ]);

    if (seasonResponse.error) {
      throw seasonResponse.error;
    }

    if (teamResponse.error) {
      throw teamResponse.error;
    }

    seasons = seasonResponse.data || [];
    teams = teamResponse.data || [];
    results = resultRows;
    games = gameRows;
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Champions</h1>

        <p>
          Unable to load championship history:
          {" "}
          {error.message}
        </p>
      </main>
    );
  }

  // ---------------------------------------------
  // TEAM NAMES
  // ---------------------------------------------

  const teamNames = new Map(
    teams.map((team) => [
      `${team.season_year}:${team.owner_id}`,
      team.team_name,
    ])
  );

  function teamName(year, ownerId) {
    return (
      teamNames.get(
        `${year}:${ownerId}`
      ) || "Team name unavailable"
    );
  }

  // ---------------------------------------------
  // RANKINGS
  // ---------------------------------------------

  const {
    ranked,
    incomplete,
  } = buildRankings(
    seasons,
    results,
    games
  );

  const best = ranked[0] || null;

  const years = seasons.map(
    (season) => n(season.year)
  );

  const first = years.length
    ? Math.min(...years)
    : 2014;

  const last = years.length
    ? Math.max(...years)
    : 2025;

  // ---------------------------------------------
  // PAGE
  // ---------------------------------------------

  return (
    <main className="page-shell">

      {/* HEADER */}

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

      {/* HERO */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            THE LEAGUE ARCHIVE
          </p>

          <h1>Champions</h1>

          <p>
            Every Dirty P champion since 2014,
            ranked against the greatest
            championship seasons in league
            history.
          </p>
        </div>

        <div className="owners-count">
          <strong>
            {seasons.length}
          </strong>

          <span>
            CHAMPIONSHIPS
          </span>
        </div>
      </section>

      {/* NAVIGATION */}

      <nav className="page-nav">
        <Link href="/">
          ← Home
        </Link>

        <span>
          {first}–{last}
        </span>
      </nav>

      {/* =========================================
          MOST DOMINANT CHAMPION EVER
          ========================================= */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE GREATEST CHAMPIONSHIP SEASON
            </p>

            <h2>
              Most Dominant Champion Ever
            </h2>
          </div>
        </div>

        {best ? (
          <article className="dp-dominant-card">

            <div className="dp-dominant-header">
              <div>
                <span className="owner-status">
                  🏆 MOST DOMINANT CHAMPION EVER
                </span>

                <h3>
                  {best.season.champion.name}
                </h3>

                <p>
                  {teamName(
                    best.year,
                    best.ownerId
                  )}
                </p>

                <strong className="dp-year">
                  {best.year} LEAGUE CHAMPION
                </strong>
              </div>

              <div className="dp-dominant-total">
                <span>🏆</span>

                <strong>
                  #1
                </strong>

                <span>
                  ALL-TIME CHAMPIONSHIP RANK
                </span>
              </div>
            </div>

            {/* PERFORMANCE */}

            <div className="dp-dominant-stats">
              <Stat
                value={best.record}
                label="REGULAR-SEASON RECORD"
                detail={`${fmt(
                  best.winningPercentage,
                  1
                )}% Winning Percentage`}
              />

              <Stat
                value={signed(
                  best.avgPointDifferential
                )}
                label="AVG. POINT DIFFERENTIAL"
                detail="Per Regular-Season Game"
              />

              <Stat
                value={signed(
                  best.combinedPlayoffMargin
                )}
                label="COMBINED PLAYOFF MARGIN"
                detail="Semifinal + Championship"
              />
            </div>

            {/* RANK BREAKDOWN */}

            <div className="dp-dominance-explainer">
              <h4>
                Why This Season Ranks #1
              </h4>

              <p>
                Every Dirty P championship season
                is compared across three categories.
                Each category contributes one
                ranking, and the lowest combined
                rank wins.
              </p>

              <div className="dp-breakdown">
                <div>
                  <strong>
                    #{fmt(best.winRank, 1)}
                  </strong>

                  <span>
                    Regular-Season Record
                  </span>

                  <p>
                    {best.record} record with a
                    {" "}
                    {fmt(
                      best.winningPercentage,
                      1
                    )}% winning percentage.
                  </p>
                </div>

                <div>
                  <strong>
                    #{fmt(best.regularRank, 1)}
                  </strong>

                  <span>
                    Regular-Season Dominance
                  </span>

                  <p>
                    {signed(
                      best.avgPointDifferential
                    )} points per game against
                    opponents.
                  </p>

                  <small>
                    Scoring-adjusted dominance:
                    {" "}
                    {signed(
                      best.regularDominance
                    )}%
                  </small>
                </div>

                <div>
                  <strong>
                    #{fmt(best.playoffRank, 1)}
                  </strong>

                  <span>
                    Playoff Dominance
                  </span>

                  <p>
                    Semifinal:
                    {" "}
                    {signed(
                      best.semifinalMargin
                    )}
                    <br />
                    Championship:
                    {" "}
                    {signed(
                      best.championshipMargin
                    )}
                  </p>

                  <small>
                    Scoring-adjusted dominance:
                    {" "}
                    {fmt(
                      best.playoffDominance
                    )}%
                  </small>
                </div>
              </div>

              <p className="dp-score-explanation">
                <strong>
                  Combined Rank:
                  {" "}
                  {fmt(best.rankTotal, 1)}
                </strong>

                {" "}— the sum of this team's
                positions in the three categories.
                A lower total means a stronger
                championship season.
              </p>
            </div>
          </article>
        ) : (
          <article className="owner-card dp-message">
            <h3>
              Championship rankings unavailable
            </h3>

            <p>
              Complete season records and both
              playoff rounds are required to
              determine the winner.
            </p>
          </article>
        )}
      </section>

      {/* =========================================
          ALL-TIME CHAMPIONSHIP RANKINGS
          ========================================= */}

      <section className="owners-section">

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              2014–2025
            </p>

            <h2>
              Championship Season Rankings
            </h2>
          </div>

          <span>
            {ranked.length} Ranked Seasons
          </span>
        </div>

        <p className="dp-rank-intro">
          Every championship team is evaluated
          using regular-season winning percentage,
          regular-season point differential,
          and combined playoff winning margin.
          Scoring statistics are adjusted to
          the league's scoring environment in
          that particular year.
        </p>

        <div className="dp-ranking-scroll">
          <table className="dp-ranking-table">

            <thead>
              <tr>
                <th>RANK</th>
                <th>CHAMPION</th>
                <th>YEAR</th>
                <th>RECORD</th>
                <th>WIN %</th>
                <th>AVG. +/-</th>
                <th>PLAYOFF +/-</th>
                <th>RANK TOTAL</th>
              </tr>
            </thead>

            <tbody>
              {ranked.map((row) => (
                <tr
                  key={row.year}
                  className={
                    row.overallRank === 1
                      ? "dp-ranking-first"
                      : ""
                  }
                >
                  <td>
                    <strong className="dp-rank-number">
                      #{row.overallRank}
                    </strong>
                  </td>

                  <td>
                    <Link
                      href={`/owners/${row.ownerId}`}
                      className="dp-rank-owner"
                    >
                      {row.season.champion.name}
                    </Link>

                    <small className="dp-rank-team">
                      {teamName(
                        row.year,
                        row.ownerId
                      )}
                    </small>
                  </td>

                  <td>
                    {row.year}
                  </td>

                  <td>
                    {row.record}
                  </td>

                  <td>
                    {fmt(
                      row.winningPercentage,
                      1
                    )}%
                  </td>

                  <td>
                    {signed(
                      row.avgPointDifferential
                    )}
                  </td>

                  <td>
                    {signed(
                      row.combinedPlayoffMargin
                    )}
                  </td>

                  <td>
                    <strong className="dp-rank-total">
                      {fmt(
                        row.rankTotal,
                        1
                      )}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>

        {/* =========================================
            CATEGORY RANK DETAILS
            ========================================= */}

        <details className="dp-ranking-details">
          <summary>
            View Individual Category Rankings
            <span>+</span>
          </summary>

          <div className="dp-ranking-scroll">
            <table className="dp-ranking-table">
              <thead>
                <tr>
                  <th>CHAMPION</th>
                  <th>YEAR</th>
                  <th>WIN RANK</th>
                  <th>REGULAR RANK</th>
                  <th>PLAYOFF RANK</th>
                  <th>TOTAL</th>
                </tr>
              </thead>

              <tbody>
                {ranked.map((row) => (
                  <tr key={row.year}>
                    <td>
                      {row.season.champion.name}
                    </td>

                    <td>{row.year}</td>

                    <td>
                      {fmt(row.winRank, 1)}
                    </td>

                    <td>
                      {fmt(row.regularRank, 1)}
                    </td>

                    <td>
                      {fmt(row.playoffRank, 1)}
                    </td>

                    <td>
                      <strong>
                        {fmt(
                          row.rankTotal,
                          1
                        )}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* =========================================
            RANKING EXPLANATION
            ========================================= */}

        <details className="dp-ranking-details">
          <summary>
            How Are Championship Seasons Ranked?
            <span>+</span>
          </summary>

          <div className="dp-ranking-method">

            <h4>
              Three Categories. Equal Importance.
            </h4>

            <p>
              Every championship team receives
              a ranking in three categories.
              First place receives 1 point,
              second place receives 2 points,
              and so on.
            </p>

            <p>
              <strong>
                1. Regular-Season Winning Percentage
              </strong>
            </p>

            <p>
              How frequently did the champion
              win during the regular season?
              Ties count as half a win.
            </p>

            <p>
              <strong>
                2. Regular-Season Scoring Dominance
              </strong>
            </p>

            <p>
              We calculate the champion's average
              point differential per game,
              including both wins and losses.
              We then divide that by the
              league-average team score
              for that season.
            </p>

            <p>
              This makes point differentials
              comparable across years with
              different fantasy scoring systems.
            </p>

            <p>
              <strong>
                3. Playoff Dominance
              </strong>
            </p>

            <p>
              We combine the semifinal winning
              margin and championship winning
              margin. That total is divided by
              the league-average weekly team
              score multiplied by the number
              of scoring weeks across both rounds.
            </p>

            <p>
              <strong>
                Final Ranking
              </strong>
            </p>

            <p>
              The three category ranks are added
              together. The champion with the
              lowest combined rank is the
              Most Dominant Champion Ever.
            </p>

            <div className="dp-ranking-example">
              <span>
                Example
              </span>

              <p>
                Regular-season rank: 2
              </p>

              <p>
                Scoring dominance rank: 1
              </p>

              <p>
                Playoff dominance rank: 5
              </p>

              <strong>
                Combined Rank = 8
              </strong>
            </div>

            <p className="dp-ranking-note">
              Tied category statistics receive
              average ranks. Exact final-rank
              ties are broken by regular-season
              scoring dominance, then playoff
              dominance, then winning percentage,
              then earlier season.
            </p>

            <p className="dp-ranking-note">
              Scoring adjustments are based on
              actual yearly league averages,
              not an assumed date for the
              switch from standard scoring
              to full PPR.
            </p>
          </div>
        </details>

        {incomplete.length > 0 && (
          <p className="dp-missing-note">
            {incomplete.length}
            {" "}championship season
            {incomplete.length === 1 ? "" : "s"}
            {" "}could not be ranked because
            regular-season or playoff data
            is incomplete.

            {" "}The rankings above include
            only seasons with all three
            required statistics.
          </p>
        )}
      </section>

      {/* =========================================
          CHAMPIONSHIP HISTORY
          ========================================= */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>
              Championship History
            </h2>
          </div>

          <span>
            {seasons.length} Seasons
          </span>
        </div>

        <div className="dp-champion-history">

          {seasons.map((season) => (
            <article
              className="dp-champion-row"
              key={season.year}
            >
              <div className="dp-champion-year">
                {season.year}
              </div>

              <div>
                <span className="owner-status">
                  🏆 LEAGUE CHAMPION
                </span>

                <h3>
                  {season.champion?.id ? (
                    <Link
                      href={`/owners/${season.champion.id}`}
                    >
                      {season.champion.name}
                    </Link>
                  ) : (
                    season.champion?.name || "—"
                  )}
                </h3>

                <p>
                  {teamName(
                    season.year,
                    season.champion?.id
                  )}
                </p>
              </div>

              <div>
                <span className="owner-status">
                  FINAL SCORE
                </span>

                <strong>
                  {season.championship_score ||
                    "—"}
                </strong>
              </div>

              <div>
                <span className="owner-status">
                  RUNNER-UP
                </span>

                <strong>
                  {season.runner_up?.name || "—"}
                </strong>

                <p>
                  {teamName(
                    season.year,
                    season.runner_up?.id
                  )}
                </p>
              </div>
            </article>
          ))}

        </div>
      </section>

      {/* FOOTER */}

      <footer className="site-footer">
        <strong>
          Dirty P Fantasy Football
        </strong>

        <span>
          The League Archive · Est. 2014
        </span>

        <p>
          Independent fantasy league archive.
          Not affiliated with or endorsed by ESPN.
        </p>
      </footer>

      {/* =========================================
          STYLES
          ========================================= */}

      <style>{`
        .dp-dominant-card {
          background:#171d26;
          border:1px solid #806539;
          border-radius:16px;
          overflow:hidden;
        }

        .dp-dominant-header {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:22px;
          flex-wrap:wrap;
          padding:28px;
        }

        .dp-dominant-header h3 {
          color:#f5f6f8;
          margin:12px 0 8px;
          font-size:clamp(24px,4vw,34px);
        }

        .dp-dominant-header p {
          color:#aeb9c7;
          margin:0 0 12px;
        }

        .dp-year {
          color:#e9bd67;
          font-size:12px;
        }

        .dp-dominant-total {
          display:flex;
          flex-direction:column;
          gap:5px;
          align-items:center;
          color:#e9bd67;
        }

        .dp-dominant-total > span:first-child {
          font-size:34px;
        }

        .dp-dominant-total strong {
          font-size:44px;
          font-weight:900;
          font-variant-numeric:tabular-nums;
        }

        .dp-dominant-total > span:last-child {
          font-size:10px;
          font-weight:800;
          letter-spacing:1px;
          text-align:center;
        }

        .dp-dominant-stats {
          display:grid;
          grid-template-columns:repeat(
            3,
            minmax(0,1fr)
          );
          gap:1px;
          background:#303947;
          border-block:1px solid #303947;
        }

        .dp-ranking-stat {
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:8px;
          padding:20px 10px;
          background:#1c2430;
          text-align:center;
        }

        .dp-ranking-stat strong {
          color:#f5f6f8;
          font-size:clamp(17px,3vw,25px);
          font-variant-numeric:tabular-nums;
        }

        .dp-ranking-stat span {
          color:#e9bd67;
          font-size:10px;
          font-weight:800;
          line-height:1.5;
        }

        .dp-ranking-stat small {
          color:#a4afbd;
          font-size:11px;
        }

        .dp-dominance-explainer {
          padding:24px;
          color:#b5c0ce;
          font-size:13px;
          line-height:1.65;
        }

        .dp-dominance-explainer h4 {
          color:#e9bd67;
          margin:0 0 10px;
          font-size:17px;
        }

        .dp-breakdown {
          display:grid;
          grid-template-columns:repeat(
            3,
            minmax(0,1fr)
          );
          gap:12px;
          margin:20px 0;
        }

        .dp-breakdown > div {
          padding:15px;
          background:#222b37;
          border:1px solid #354150;
          border-radius:10px;
        }

        .dp-breakdown strong {
          display:block;
          color:#e9bd67;
          font-size:21px;
        }

        .dp-breakdown span {
          display:block;
          color:#f2f4f7;
          font-weight:800;
          margin-top:4px;
        }

        .dp-breakdown p {
          margin:8px 0;
        }

        .dp-breakdown small {
          color:#d5b77c;
        }

        .dp-score-explanation {
          margin-bottom:0;
        }

        .dp-score-explanation strong {
          color:#e9bd67;
        }

        .dp-message {
          padding:22px;
        }

        .dp-rank-intro {
          color:#aeb9c7;
          font-size:13px;
          line-height:1.7;
          margin:0 0 18px;
        }

        .dp-ranking-scroll {
          width:100%;
          overflow-x:auto;
          border:1px solid #303947;
          border-radius:12px;
          background:#171d26;
        }

        .dp-ranking-table {
          width:100%;
          min-width:850px;
          border-collapse:collapse;
          font-variant-numeric:tabular-nums;
        }

        .dp-ranking-table thead {
          background:#222b37;
        }

        .dp-ranking-table th {
          color:#aeb9c7;
          font-size:10px;
          font-weight:800;
          letter-spacing:.6px;
          padding:16px 12px;
          text-align:left;
          white-space:nowrap;
        }

        .dp-ranking-table td {
          color:#dce2e9;
          font-size:13px;
          padding:17px 12px;
          border-top:1px solid #303947;
          white-space:nowrap;
        }

        .dp-ranking-table tbody tr:hover {
          background:#202936;
        }

        .dp-ranking-table .dp-ranking-first {
          background:rgba(233,189,103,.08);
        }

        .dp-ranking-table .dp-ranking-first:hover {
          background:rgba(233,189,103,.13);
        }

        .dp-rank-number {
          color:#e9bd67;
          font-size:17px;
        }

        .dp-rank-owner {
          color:#f5f6f8;
          font-weight:800;
          text-decoration:none;
        }

        .dp-rank-owner:hover {
          color:#e9bd67;
        }

        .dp-rank-team {
          display:block;
          color:#8898aa;
          margin-top:5px;
          font-size:11px;
        }

        .dp-rank-total {
          color:#e9bd67;
          font-size:16px;
        }

        .dp-ranking-details {
          margin-top:14px;
          border:1px solid #354150;
          border-radius:12px;
          background:#171d26;
          overflow:hidden;
        }

        .dp-ranking-details summary {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          cursor:pointer;
          padding:17px 19px;
          color:#e9bd67;
          font-size:13px;
          font-weight:800;
          list-style:none;
        }

        .dp-ranking-details summary::-webkit-details-marker {
          display:none;
        }

        .dp-ranking-details summary span {
          font-size:21px;
          line-height:1;
        }

        .dp-ranking-details[open] summary span {
          transform:rotate(45deg);
        }

        .dp-ranking-details .dp-ranking-scroll {
          border:none;
          border-top:1px solid #354150;
          border-radius:0;
        }

        .dp-ranking-method {
          padding:20px;
          border-top:1px solid #354150;
          color:#b5c0ce;
          font-size:13px;
          line-height:1.7;
        }

        .dp-ranking-method h4 {
          color:#f3f5f7;
          font-size:17px;
          margin:0 0 14px;
        }

        .dp-ranking-method p {
          margin:0 0 14px;
        }

        .dp-ranking-method p strong {
          color:#e9bd67;
        }

        .dp-ranking-example {
          background:#222b37;
          border:1px solid #354150;
          border-radius:10px;
          padding:16px;
          margin:18px 0;
        }

        .dp-ranking-example > span {
          display:block;
          color:#e9bd67;
          font-weight:800;
          margin-bottom:10px;
        }

        .dp-ranking-example p {
          margin:4px 0;
        }

        .dp-ranking-example > strong {
          display:block;
          color:#e9bd67;
          margin-top:14px;
          font-size:17px;
        }

        .dp-ranking-note {
          color:#93a3b5;
          font-size:12px;
        }

        .dp-missing-note {
          color:#a6b2c0;
          font-size:12px;
          margin-top:12px;
          line-height:1.6;
        }

        .dp-champion-history {
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .dp-champion-row {
          display:grid;
          grid-template-columns:
            75px 1.5fr 1fr 1fr;
          align-items:center;
          gap:16px;
          padding:20px;
          background:#171d26;
          border:1px solid #303947;
          border-radius:12px;
        }

        .dp-champion-year {
          color:#e9bd67;
          font-size:22px;
          font-weight:900;
        }

        .dp-champion-row h3 {
          margin:6px 0;
          font-size:16px;
          color:#f5f6f8;
        }

        .dp-champion-row a {
          color:inherit;
          text-decoration:none;
        }

        .dp-champion-row a:hover {
          color:#e9bd67;
        }

        .dp-champion-row p {
          color:#a3afbe;
          margin:4px 0 0;
          font-size:12px;
        }

        .dp-champion-row > div > strong {
          display:block;
          margin-top:7px;
          color:#f3f5f7;
          font-size:14px;
        }

        @media(max-width:750px) {
          .dp-breakdown {
            grid-template-columns:1fr;
          }

          .dp-dominant-stats {
            grid-template-columns:1fr;
          }

          .dp-champion-row {
            grid-template-columns:60px 1fr;
          }

          .dp-champion-row > div:nth-child(n+3) {
            grid-column:2;
          }

          .dp-dominant-header {
            padding:22px;
          }
        }
      `}</style>
    </main>
  );
}
