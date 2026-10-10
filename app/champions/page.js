import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// =====================================================
// HELPERS
// =====================================================

const n = (value) =>
  Number.isFinite(Number(value))
    ? Number(value)
    : 0;

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

function signed(value) {
  if (!valid(value)) return "—";

  return `${n(value) >= 0 ? "+" : ""}${fmt(
    value
  )}`;
}

// =====================================================
// LOAD HISTORICAL DATA
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

    if (error) {
      throw new Error(error.message);
    }

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

  if (
    n(game.home_score) >
    n(game.away_score)
  ) {
    return n(game.home_owner_id);
  }

  if (
    n(game.away_score) >
    n(game.home_score)
  ) {
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
  // but do not count toward this award.
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
// CHAMPIONSHIP SEASON ANALYSIS
//
// THREE CATEGORIES:
//
// 1. Regular-season winning percentage
// 2. Regular-season point differential
//    relative to league scoring
// 3. Combined semifinal and championship
//    margin relative to league scoring
//
// Each category counts equally.
// =====================================================

function calculateSeasons(
  seasons,
  results,
  matchups
) {
  return seasons.map((season) => {
    const year = n(season.year);
    const ownerId = n(season.champion?.id);

    // ---------------------------------------------
    // REGULAR-SEASON RESULTS
    // ---------------------------------------------

    const leagueResults = results.filter(
      (row) =>
        n(row.season_year) === year
    );

    const championResult = leagueResults.find(
      (row) =>
        n(row.owner_id) === ownerId
    );

    // ---------------------------------------------
    // LEAGUE-AVERAGE TEAM SCORE
    //
    // This adjusts for scoring differences
    // between the 0-PPR and PPR eras.
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
        ? totalLeaguePoints / totalLeagueGames
        : null;

    // ---------------------------------------------
    // CATEGORY 1: WINNING PERCENTAGE
    // ---------------------------------------------

    const totalGames =
      gamesPlayed(championResult);

    const winningPercentage =
      championResult && totalGames > 0
        ? winPct(championResult) * 100
        : null;

    // ---------------------------------------------
    // CATEGORY 2: REGULAR-SEASON DOMINANCE
    //
    // Includes both wins and losses.
    // ---------------------------------------------

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
        ? totalPointDifferential / totalGames
        : null;

    const regularDominance =
      avgPointDifferential !== null &&
      leagueAverage > 0
        ? (
            avgPointDifferential /
            leagueAverage
          ) * 100
        : null;

    // ---------------------------------------------
    // CATEGORY 3: PLAYOFF DOMINANCE
    // ---------------------------------------------

    const ownerGames = matchups.filter(
      (game) =>
        n(game.season_year) === year &&
        playedBy(game, ownerId)
    );

    // Find the championship victory.

    const championshipGames = ownerGames
      .filter(
        (game) =>
          roundOf(game) === "championship" &&
          winnerId(game) === ownerId
      )
      .sort(
        (a, b) =>
          matchupWeek(b) -
          matchupWeek(a)
      );

    const championship =
      championshipGames[0] || null;

    // Find the semifinal victory.
    //
    // Historical imports may label this
    // simply as "playoff".
    //
    // Use the latest playoff victory before
    // the championship game.

    const semifinalCandidates = ownerGames
      .filter((game) => {
        const type = roundOf(game);

        return (
          (
            type === "semifinal" ||
            type === "playoff"
          ) &&
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
        ? winningMargin(semifinal, ownerId)
        : null;

    const championshipMargin =
      championship
        ? winningMargin(championship, ownerId)
        : null;

    const combinedPlayoffMargin =
      semifinalMargin !== null &&
      championshipMargin !== null
        ? semifinalMargin +
          championshipMargin
        : null;

    // Account for one-week or two-week
    // playoff matchups.

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
    // COMPLETE DATA CHECK
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
    };
  });
}

// =====================================================
// ASSIGN CATEGORY RANKS
//
// 1st = 1
// 2nd = 2
// 3rd = 3
//
// Ties receive average ranks.
// =====================================================

function assignRanks(
  rows,
  field,
  destination
) {
  const sorted = [...rows].sort(
    (a, b) =>
      n(b[field]) - n(a[field])
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

    const averageRank =
      ((position + 1) + end) / 2;

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

// =====================================================
// FIND THE MOST DOMINANT CHAMPION
//
// FORMULA:
//
// DOMINANCE RANK =
// WINNING % RANK
// +
// REGULAR-SEASON DOMINANCE RANK
// +
// PLAYOFF DOMINANCE RANK
//
// LOWEST TOTAL WINS.
// =====================================================

function findMostDominantChampion(
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

  // Lowest total is most dominant.
  //
  // Tie breakers:
  // 1. Regular-season scoring dominance
  // 2. Playoff dominance
  // 3. Winning percentage
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

  return {
    champion: eligible[0] || null,
    eligibleCount: eligible.length,
    incompleteCount:
      all.length - eligible.length,
  };
}

// =====================================================
// STAT CARD
// =====================================================

function Stat({
  value,
  label,
  detail,
}) {
  return (
    <div className="dp-ranking-stat">
      <strong>{value}</strong>

      <span>{label}</span>

      {detail && (
        <small>{detail}</small>
      )}
    </div>
  );
}

// =====================================================
// MAIN CHAMPIONS PAGE
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

  // ===================================================
  // TEAM NAMES
  // ===================================================

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

  // ===================================================
  // MOST DOMINANT CHAMPION
  // ===================================================

  const {
    champion,
    eligibleCount,
    incompleteCount,
  } = findMostDominantChampion(
    seasons,
    results,
    games
  );

  const years = seasons.map(
    (season) => n(season.year)
  );

  const first = years.length
    ? Math.min(...years)
    : 2014;

  const last = years.length
    ? Math.max(...years)
    : 2025;

  // ===================================================
  // PAGE
  // ===================================================

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
            Every Dirty P champion since 2014
            and the most dominant championship
            season in league history.
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

        {champion ? (
          <article className="dp-dominant-card">

            {/* CHAMPION */}

            <div className="dp-dominant-header">
              <div>
                <span className="owner-status">
                  🏆 MOST DOMINANT CHAMPION EVER
                </span>

                <h3>
                  {champion.season.champion.name}
                </h3>

                <p>
                  {teamName(
                    champion.year,
                    champion.ownerId
                  )}
                </p>

                <strong className="dp-year">
                  {champion.year} LEAGUE CHAMPION
                </strong>
              </div>

              <div className="dp-dominant-total">
                <span>🏆</span>

                <strong>
                  #1
                </strong>

                <span>
                  ALL-TIME CHAMPIONSHIP
                </span>
              </div>
            </div>

            {/* PERFORMANCE STATS */}

            <div className="dp-dominant-stats">

              <Stat
                value={champion.record}
                label="REGULAR-SEASON RECORD"
                detail={`${fmt(
                  champion.winningPercentage,
                  1
                )}% Winning Percentage`}
              />

              <Stat
                value={signed(
                  champion.avgPointDifferential
                )}
                label="AVG. POINT DIFFERENTIAL"
                detail="Per Regular-Season Game"
              />

              <Stat
                value={signed(
                  champion.combinedPlayoffMargin
                )}
                label="COMBINED PLAYOFF MARGIN"
                detail="Semifinal + Championship"
              />

            </div>

            {/* SIMPLE FORMULA */}

            <div className="dp-dominance-explainer">

              <h4>
                How Is the Most Dominant
                Champion Determined?
              </h4>

              <p>
                We compare every championship
                season in Dirty P history using
                three equally important factors:
              </p>

              <div className="dp-simple-factors">

                <div>
                  <strong>1</strong>

                  <div>
                    <h5>
                      Winning Percentage
                    </h5>

                    <p>
                      How often the team won
                      during the regular season.
                    </p>
                  </div>
                </div>

                <div>
                  <strong>2</strong>

                  <div>
                    <h5>
                      Regular-Season Dominance
                    </h5>

                    <p>
                      Average point differential
                      per game, compared to that
                      season's league-average
                      team score.
                    </p>
                  </div>
                </div>

                <div>
                  <strong>3</strong>

                  <div>
                    <h5>
                      Playoff Dominance
                    </h5>

                    <p>
                      Combined semifinal and
                      championship winning
                      margins, adjusted for
                      league scoring and
                      scoring weeks.
                    </p>
                  </div>
                </div>

              </div>

              {/* FORMULA BOX */}

              <div className="dp-formula-box">

                <span>
                  THE FORMULA
                </span>

                <strong>
                  Dominance Rank =
                </strong>

                <div className="dp-formula-equation">
                  <span>
                    Winning % Rank
                  </span>

                  <b>+</b>

                  <span>
                    Regular-Season Rank
                  </span>

                  <b>+</b>

                  <span>
                    Playoff Rank
                  </span>
                </div>

                <p>
                  Every champion is ranked
                  against the others in each
                  category. First place earns
                  1 point, second earns 2,
                  and so on.
                </p>

                <p>
                  <strong>
                    The lowest combined
                    ranking wins.
                  </strong>
                </p>

              </div>

              <p className="dp-scoring-note">
                Because Dirty P changed from
                standard scoring (0 PPR) to
                full PPR, point differentials
                are compared against each
                season's average scoring.
                This allows champions from
                different scoring eras to
                compete more fairly.
              </p>

              {eligibleCount > 0 && (
                <p className="dp-scoring-note">
                  Compared against
                  {" "}
                  {eligibleCount}
                  {" "}
                  championship
                  {" "}
                  {eligibleCount === 1
                    ? "season"
                    : "seasons"}
                  .
                </p>
              )}

            </div>

          </article>
        ) : (
          <article className="owner-card dp-message">

            <h3>
              Championship ranking unavailable
            </h3>

            <p>
              Complete regular-season data,
              semifinal results, and
              championship results are
              required to determine the award.
            </p>

          </article>
        )}

        {incompleteCount > 0 && (
          <p className="dp-missing-note">
            {incompleteCount}
            {" "}championship
            {" "}
            {incompleteCount === 1
              ? "season lacks"
              : "seasons lack"}
            {" "}complete historical data.
            The award currently compares
            only eligible seasons.
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
                  {season.runner_up?.name ||
                    "—"}
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
          grid-template-columns:
            repeat(3,minmax(0,1fr));
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
          margin:0 0 15px;
          font-size:17px;
        }

        .dp-dominance-explainer > p {
          margin:0 0 17px;
        }

        /* THREE SIMPLE FACTORS */

        .dp-simple-factors {
          display:flex;
          flex-direction:column;
          gap:12px;
          margin:18px 0 22px;
        }

        .dp-simple-factors > div {
          display:flex;
          align-items:flex-start;
          gap:14px;
          padding:14px 16px;
          background:#222b37;
          border:1px solid #354150;
          border-radius:10px;
        }

        .dp-simple-factors > div > strong {
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
          width:30px;
          height:30px;
          border-radius:50%;
          background:#806539;
          color:#fff;
          font-size:13px;
        }

        .dp-simple-factors h5 {
          color:#f2f4f7;
          font-size:13px;
          margin:0 0 4px;
        }

        .dp-simple-factors p {
          color:#aeb9c7;
          font-size:12px;
          margin:0;
          line-height:1.6;
        }

        /* FORMULA */

        .dp-formula-box {
          background:#1c2430;
          border:1px solid #806539;
          border-radius:12px;
          padding:22px;
          margin:20px 0;
          text-align:center;
        }

        .dp-formula-box > span {
          display:block;
          color:#e9bd67;
          font-size:10px;
          font-weight:900;
          letter-spacing:1px;
          margin-bottom:12px;
        }

        .dp-formula-box > strong {
          display:block;
          color:#f2f4f7;
          font-size:17px;
          margin-bottom:17px;
        }

        .dp-formula-equation {
          display:flex;
          justify-content:center;
          align-items:center;
          flex-wrap:wrap;
          gap:9px;
          margin-bottom:18px;
        }

        .dp-formula-equation span {
          background:#2c3643;
          color:#e9bd67;
          padding:9px 11px;
          border-radius:7px;
          font-size:12px;
          font-weight:800;
        }

        .dp-formula-equation b {
          color:#f2f4f7;
          font-size:18px;
        }

        .dp-formula-box p {
          color:#aeb9c7;
          font-size:12px;
          line-height:1.7;
          margin:8px 0 0;
        }

        .dp-formula-box p strong {
          color:#e9bd67;
        }

        .dp-scoring-note {
          color:#94a3b5;
          font-size:12px;
          line-height:1.7;
        }

        .dp-message {
          padding:22px;
        }

        .dp-missing-note {
          color:#a6b2c0;
          font-size:12px;
          margin-top:12px;
          line-height:1.6;
        }

        /* CHAMPIONSHIP HISTORY */

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

        /* MOBILE */

        @media(max-width:750px) {

          .dp-dominant-stats {
            grid-template-columns:1fr;
          }

          .dp-dominant-header {
            padding:22px;
          }

          .dp-dominance-explainer {
            padding:20px;
          }

          .dp-champion-row {
            grid-template-columns:60px 1fr;
          }

          .dp-champion-row > div:nth-child(n+3) {
            grid-column:2;
          }

          .dp-formula-box {
            padding:17px;
          }

        }

      `}</style>

    </main>
  );
}
