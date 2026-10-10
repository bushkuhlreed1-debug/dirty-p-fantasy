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
  return n(row?.wins) + n(row?.losses) + n(row?.ties);
}

function winPct(row) {
  const total = gamesPlayed(row);

  return total
    ? (n(row.wins) + n(row.ties) / 2) / total
    : null;
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

  return `${n(value) >= 0 ? "+" : ""}${fmt(value)}`;
}

// =====================================================
// FETCH HISTORICAL DATA
// =====================================================

async function fetchAll(table) {
  const rows = [];

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: true })
      .range(offset, offset + 499);

    if (error) throw new Error(error.message);

    rows.push(...(data || []));

    if (!data || data.length < 500) break;
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

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") return n(game.home_owner_id);
  if (winner === "AWAY") return n(game.away_owner_id);
  if (winner === "TIE") return null;

  if (n(game.home_score) > n(game.away_score)) {
    return n(game.home_owner_id);
  }

  if (n(game.away_score) > n(game.home_score)) {
    return n(game.away_owner_id);
  }

  return null;
}

function winningMargin(game, ownerId) {
  if (!game || winnerId(game) !== ownerId) {
    return null;
  }

  return Math.abs(
    n(game.home_score) - n(game.away_score)
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
// ANALYZE CHAMPIONSHIP SEASONS
//
// 1. REGULAR-SEASON WINNING PERCENTAGE
// 2. REGULAR-SEASON SCORING DOMINANCE
// 3. PLAYOFF DOMINANCE
//
// EACH CATEGORY HAS EQUAL WEIGHT.
// =====================================================

function calculateSeasons(seasons, results, matchups) {
  return seasons.map((season) => {
    const year = n(season.year);
    const ownerId = n(season.champion?.id);

    const leagueResults = results.filter(
      (row) => n(row.season_year) === year
    );

    const championResult = leagueResults.find(
      (row) => n(row.owner_id) === ownerId
    );

    // League-average weekly team score.
    // This accounts for scoring differences
    // between 0-PPR and full-PPR seasons.

    const scoredTeams = leagueResults.filter(
      (row) =>
        gamesPlayed(row) > 0 &&
        valid(row.points_for) &&
        valid(row.points_against)
    );

    const totalLeaguePoints = scoredTeams.reduce(
      (sum, row) => sum + n(row.points_for),
      0
    );

    const totalLeagueGames = scoredTeams.reduce(
      (sum, row) => sum + gamesPlayed(row),
      0
    );

    const leagueAverage =
      totalLeagueGames > 0
        ? totalLeaguePoints / totalLeagueGames
        : null;

    // CATEGORY 1: WINNING PERCENTAGE

    const totalGames = gamesPlayed(championResult);

    const winningPercentage =
      championResult && totalGames > 0
        ? winPct(championResult) * 100
        : null;

    // CATEGORY 2: REGULAR-SEASON DOMINANCE
    // Includes wins and losses.

    const totalPointDifferential =
      championResult &&
      valid(championResult.points_for) &&
      valid(championResult.points_against)
        ? n(championResult.points_for) -
          n(championResult.points_against)
        : null;

    const avgPointDifferential =
      totalPointDifferential !== null && totalGames > 0
        ? totalPointDifferential / totalGames
        : null;

    const regularDominance =
      avgPointDifferential !== null && leagueAverage > 0
        ? (avgPointDifferential / leagueAverage) * 100
        : null;

    // CATEGORY 3: PLAYOFF DOMINANCE

    const ownerGames = matchups.filter(
      (game) =>
        n(game.season_year) === year &&
        playedBy(game, ownerId)
    );

    const championship = ownerGames
      .filter(
        (game) =>
          roundOf(game) === "championship" &&
          winnerId(game) === ownerId
      )
      .sort(
        (a, b) => matchupWeek(b) - matchupWeek(a)
      )[0] || null;

    // Historical semifinal matchups may
    // simply be labeled "playoff".

    const semifinal = ownerGames
      .filter((game) => {
        const type = roundOf(game);

        return (
          (type === "semifinal" || type === "playoff") &&
          winnerId(game) === ownerId &&
          championship &&
          matchupWeek(game) < matchupWeek(championship)
        );
      })
      .sort(
        (a, b) => matchupWeek(b) - matchupWeek(a)
      )[0] || null;

    const semifinalMargin = semifinal
      ? winningMargin(semifinal, ownerId)
      : null;

    const championshipMargin = championship
      ? winningMargin(championship, ownerId)
      : null;

    const combinedPlayoffMargin =
      semifinalMargin !== null &&
      championshipMargin !== null
        ? semifinalMargin + championshipMargin
        : null;

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
            (leagueAverage * playoffScoringWeeks)
          ) * 100
        : null;

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

      winRank: null,
      regularRank: null,
      playoffRank: null,
      rankTotal: null,
    };
  });
}

// =====================================================
// RANK ALL CHAMPIONSHIP SEASONS
// =====================================================

function assignRanks(rows, field, destination) {
  const sorted = [...rows].sort(
    (a, b) => n(b[field]) - n(a[field])
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

    for (let index = position; index < end; index++) {
      sorted[index][destination] = averageRank;
    }

    position = end;
  }
}

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

  // Lowest combined rank wins.
  // Tie breakers preserve existing behavior.

  eligible.sort(
    (a, b) =>
      a.rankTotal - b.rankTotal ||
      b.regularDominance - a.regularDominance ||
      b.playoffDominance - a.playoffDominance ||
      b.winningPercentage - a.winningPercentage ||
      a.year - b.year
  );

  return {
    champion: eligible[0] || null,
    eligibleCount: eligible.length,
    incompleteCount: all.length - eligible.length,
  };
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
          champion:champion_owner_id(id,name),
          runner_up:runner_up_owner_id(id,name)
        `)
        .lt("year", CURRENT_SEASON)
        .order("year", { ascending: false }),

      supabase
        .from("teams")
        .select("season_year,owner_id,team_name")
        .lt("season_year", CURRENT_SEASON),

      fetchAll("season_results"),
      fetchAll("matchups"),
    ]);

    if (seasonResponse.error) throw seasonResponse.error;
    if (teamResponse.error) throw teamResponse.error;

    seasons = seasonResponse.data || [];
    teams = teamResponse.data || [];
    results = resultRows;
    games = gameRows;

  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Champions</h1>
        <p>
          Unable to load championship history: {error.message}
        </p>
      </main>
    );
  }

  // Team name lookup.

  const teamNames = new Map(
    teams.map((team) => [
      `${team.season_year}:${team.owner_id}`,
      team.team_name,
    ])
  );

  function teamName(year, ownerId) {
    return (
      teamNames.get(`${year}:${ownerId}`) ||
      "Team name unavailable"
    );
  }

  const {
    champion,
    eligibleCount,
    incompleteCount,
  } = findMostDominantChampion(
    seasons,
    results,
    games
  );

  const years = seasons.map((season) => n(season.year));
  const first = years.length ? Math.min(...years) : 2014;
  const last = years.length ? Math.max(...years) : 2025;

  return (
    <main className="page-shell">

      {/* HEADER */}

      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      {/* PAGE HEADER */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">THE LEAGUE ARCHIVE</p>
          <h1>Champions</h1>
          <p>
            Every Dirty P league champion since 2014.
          </p>
        </div>

        <div className="owners-count">
          <strong>{seasons.length}</strong>
          <span>CHAMPIONSHIPS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>{first}–{last}</span>
      </nav>

      {/* =================================================
          NEW: MOST DOMINANT CHAMPION TEASER

          Clicking this jumps directly to the award
          beneath Championship History.
          ================================================= */}

      <a
        href="#most-dominant-champion"
        className="dp-award-teaser"
        aria-label="Jump to Most Dominant Champion Ever award"
      >
        <span className="dp-teaser-icon">
          🏆
        </span>

        <span className="dp-teaser-copy">
          <strong>
            Who Was the Most Dominant Champion Ever?
          </strong>

          <small>
            Find out below the championship history.
          </small>
        </span>

        <span
          className="dp-teaser-arrow"
          aria-hidden="true"
        >
          ↓
        </span>
      </a>

      {/* =================================================
          CHAMPIONSHIP HISTORY — PRIMARY SECTION
          ================================================= */}

      <section
        className="owners-section"
        id="championship-history"
      >

        <div className="section-heading">
          <div>
            <p className="eyebrow">YEAR BY YEAR</p>
            <h2>Championship History</h2>
          </div>

          <span>{seasons.length} Seasons</span>
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
                  {season.championship_score || "—"}
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

        {/* SUBTLE LINK AFTER THE LAST CHAMPION */}

        <a
          href="#most-dominant-champion"
          className="dp-history-bottom-link"
        >
          <span>
            You've seen every champion.
            Who had the most dominant season?
          </span>
          <span aria-hidden="true">↓</span>
        </a>

      </section>

      {/* =================================================
          MOST DOMINANT CHAMPION — COMPACT AWARD
          ================================================= */}

      <section
        className="owners-section dp-award-section"
        id="most-dominant-champion"
      >

        <div className="section-heading">
          <div>
            <p className="eyebrow">
              SPECIAL RECOGNITION
            </p>
            <h2>
              Most Dominant Champion Ever
            </h2>
          </div>
        </div>

        {champion ? (
          <article className="dp-award-card">

            {/* AWARD HEADER */}

            <div className="dp-award-header">

              <div className="dp-award-icon">
                🏆
              </div>

              <div className="dp-award-identity">

                <span className="dp-award-eyebrow">
                  ALL-TIME MOST DOMINANT SEASON
                </span>

                <h3>
                  <Link
                    href={`/owners/${champion.ownerId}`}
                  >
                    {champion.season.champion.name}
                  </Link>
                </h3>

                <p>
                  {champion.year} Champion
                  <span className="dp-award-separator">
                    {" · "}
                  </span>
                  {teamName(
                    champion.year,
                    champion.ownerId
                  )}
                </p>

              </div>

              <div className="dp-award-number">
                <strong>#1</strong>
                <span>ALL-TIME</span>
              </div>

            </div>

            {/* THREE PERFORMANCE STATISTICS */}

            <div className="dp-award-stats">

              <div>
                <strong>
                  {champion.record}
                </strong>
                <span>
                  REGULAR-SEASON RECORD
                </span>
              </div>

              <div>
                <strong>
                  {signed(
                    champion.avgPointDifferential
                  )}
                </strong>
                <span>
                  AVG. POINT DIFFERENTIAL
                </span>
              </div>

              <div>
                <strong>
                  {signed(
                    champion.combinedPlayoffMargin
                  )}
                </strong>
                <span>
                  COMBINED PLAYOFF MARGIN
                </span>
              </div>

            </div>

            {/* COLLAPSIBLE FORMULA */}

            <details className="dp-award-details">

              <summary>
                <span>
                  How Is the Most Dominant
                  Champion Determined?
                </span>

                <span
                  className="dp-details-plus"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>

              <div className="dp-award-explanation">

                <p>
                  Every championship season is
                  compared across three equally
                  important categories.
                </p>

                <div className="dp-award-factor">
                  <strong>
                    1. Winning Percentage
                  </strong>

                  <p>
                    Regular-season wins divided
                    by total regular-season games.
                    Ties count as half a win.
                  </p>
                </div>

                <div className="dp-award-factor">
                  <strong>
                    2. Regular-Season Dominance
                  </strong>

                  <p>
                    Average regular-season point
                    differential divided by that
                    season's league-average team
                    score. Both wins and losses
                    count.
                  </p>
                </div>

                <div className="dp-award-factor">
                  <strong>
                    3. Playoff Dominance
                  </strong>

                  <p>
                    Semifinal winning margin plus
                    championship winning margin,
                    divided by that season's
                    league-average team score
                    multiplied by the total
                    scoring weeks in those rounds.
                  </p>
                </div>

                {/* FORMULA */}

                <div className="dp-award-formula">

                  <span>
                    THE FORMULA
                  </span>

                  <strong>
                    Dominance Rank =
                  </strong>

                  <p>
                    Winning % Rank
                    <b> + </b>
                    Regular-Season Dominance Rank
                    <b> + </b>
                    Playoff Dominance Rank
                  </p>

                  <small>
                    First place in each category
                    earns 1 point, second earns 2,
                    and so on.
                    The lowest combined rank wins.
                  </small>

                </div>

                <p className="dp-award-note">
                  Point differentials are compared
                  against each season's average
                  scoring, so champions from the
                  0-PPR and full-PPR eras can be
                  evaluated more fairly.
                </p>

                <p className="dp-award-note">
                  {eligibleCount} championship
                  {eligibleCount === 1
                    ? " season"
                    : " seasons"}
                  {" "}included in the comparison.
                  Tied category positions receive
                  average ranks.
                </p>

                <p className="dp-award-note">
                  If two champions have the same
                  total, ties are broken by
                  regular-season scoring dominance,
                  playoff dominance, winning
                  percentage, and then earlier
                  season.
                </p>

              </div>

            </details>

          </article>
        ) : (
          <article className="owner-card dp-award-unavailable">
            <p>
              Historical matchup data is incomplete,
              so the most dominant champion cannot
              yet be determined.
            </p>
          </article>
        )}

        {incompleteCount > 0 && (
          <p className="dp-award-warning">
            {incompleteCount} championship
            {incompleteCount === 1
              ? " season has"
              : " seasons have"}
            {" "}incomplete historical data and
            {incompleteCount === 1
              ? " is"
              : " are"}
            {" "}excluded from this comparison.
          </p>
        )}

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

      {/* =================================================
          STYLES
          ================================================= */}

      <style>{`

        /* SMOOTH SCROLLING */

        @media (prefers-reduced-motion: no-preference) {
          html {
            scroll-behavior: smooth;
          }
        }

        #most-dominant-champion {
          scroll-margin-top: 25px;
        }

        /* ==========================================
           NEW: TOP TEASER
           ========================================== */

        .dp-award-teaser {
          display:flex;
          align-items:center;
          gap:14px;
          padding:15px 19px;
          margin:4px 0 25px;
          background:#202936;
          border:1px solid #806539;
          border-radius:12px;
          text-decoration:none;
          transition:
            background .2s ease,
            border-color .2s ease,
            transform .2s ease;
        }

        .dp-award-teaser:hover {
          background:#283241;
          border-color:#d7ad63;
          transform:translateY(-2px);
        }

        .dp-teaser-icon {
          display:flex;
          align-items:center;
          justify-content:center;
          width:42px;
          height:42px;
          flex-shrink:0;
          background:#34332e;
          border:1px solid #806539;
          border-radius:10px;
          font-size:22px;
        }

        .dp-teaser-copy {
          display:flex;
          flex-direction:column;
          gap:5px;
          flex:1;
          min-width:0;
        }

        .dp-teaser-copy strong {
          display:block;
          color:#f3f5f7;
          font-size:14px;
          font-weight:800;
          line-height:1.45;
        }

        .dp-teaser-copy small {
          display:block;
          color:#aeb9c7;
          font-size:12px;
          line-height:1.5;
        }

        .dp-teaser-arrow {
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
          color:#e9bd67;
          font-size:24px;
          font-weight:900;
          width:30px;
          height:30px;
          border-radius:50%;
          background:rgba(233,189,103,.08);
        }

        /* ==========================================
           CHAMPIONSHIP HISTORY
           ========================================== */

        .dp-champion-history {
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .dp-champion-row {
          display:grid;
          grid-template-columns:75px 1.5fr 1fr 1fr;
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

        /* ==========================================
           NEW: LINK BELOW CHAMPIONSHIP HISTORY
           ========================================== */

        .dp-history-bottom-link {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:12px;
          padding:18px 14px;
          margin-top:14px;
          color:#d7ad63;
          text-align:center;
          text-decoration:none;
          font-size:13px;
          font-weight:800;
          line-height:1.6;
          transition:color .2s ease;
        }

        .dp-history-bottom-link:hover {
          color:#f1d39b;
        }

        .dp-history-bottom-link span:last-child {
          font-size:22px;
        }

        /* ==========================================
           COMPACT AWARD
           ========================================== */

        .dp-award-section {
          margin-top:8px;
        }

        .dp-award-card {
          background:#171d26;
          border:1px solid #51472e;
          border-radius:14px;
          overflow:hidden;
        }

        .dp-award-header {
          display:flex;
          align-items:center;
          gap:15px;
          padding:21px 23px;
        }

        .dp-award-icon {
          display:flex;
          align-items:center;
          justify-content:center;
          width:48px;
          height:48px;
          background:#292b2b;
          border:1px solid #806539;
          border-radius:12px;
          font-size:24px;
          flex-shrink:0;
        }

        .dp-award-identity {
          flex:1;
          min-width:0;
        }

        .dp-award-eyebrow {
          display:block;
          color:#d7ad63;
          font-size:10px;
          font-weight:800;
          letter-spacing:.6px;
          margin-bottom:6px;
        }

        .dp-award-identity h3 {
          margin:0 0 5px;
          font-size:19px;
          color:#f5f6f8;
        }

        .dp-award-identity h3 a {
          color:inherit;
          text-decoration:none;
        }

        .dp-award-identity h3 a:hover {
          color:#e9bd67;
        }

        .dp-award-identity p {
          margin:0;
          color:#a6b3c1;
          font-size:12px;
          line-height:1.6;
        }

        .dp-award-separator {
          color:#d7ad63;
        }

        .dp-award-number {
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:3px;
          flex-shrink:0;
          margin-left:auto;
        }

        .dp-award-number strong {
          font-size:29px;
          color:#e9bd67;
          font-weight:900;
          line-height:1;
        }

        .dp-award-number span {
          color:#a9b4c0;
          font-size:9px;
          font-weight:800;
          letter-spacing:.8px;
        }

        /* PERFORMANCE STATS */

        .dp-award-stats {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          background:#303947;
          gap:1px;
          border-top:1px solid #303947;
          border-bottom:1px solid #303947;
        }

        .dp-award-stats > div {
          background:#1c2430;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:8px;
          padding:16px 10px;
          text-align:center;
          min-width:0;
        }

        .dp-award-stats strong {
          color:#f5f6f8;
          font-size:19px;
          font-weight:800;
          font-variant-numeric:tabular-nums;
        }

        .dp-award-stats span {
          color:#a9b6c5;
          font-size:10px;
          font-weight:700;
          line-height:1.5;
        }

        /* COLLAPSIBLE FORMULA */

        .dp-award-details {
          background:#171d26;
        }

        .dp-award-details summary {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding:16px 22px;
          cursor:pointer;
          color:#e9bd67;
          font-size:12px;
          font-weight:800;
          list-style:none;
        }

        .dp-award-details summary::-webkit-details-marker {
          display:none;
        }

        .dp-award-details summary:hover {
          background:#1d2530;
        }

        .dp-details-plus {
          font-size:22px;
          line-height:1;
          transition:transform .2s ease;
        }

        .dp-award-details[open] .dp-details-plus {
          transform:rotate(45deg);
        }

        .dp-award-explanation {
          padding:5px 22px 23px;
          border-top:1px solid #303947;
          color:#b5c0ce;
          font-size:12px;
          line-height:1.75;
        }

        .dp-award-explanation > p {
          margin:14px 0;
        }

        .dp-award-factor {
          padding:10px 0;
          border-bottom:1px solid #303947;
        }

        .dp-award-factor strong {
          color:#f2f4f7;
          font-size:13px;
        }

        .dp-award-factor p {
          margin:5px 0 0;
          color:#aeb9c7;
        }

        .dp-award-formula {
          background:#202936;
          border:1px solid #51472e;
          border-radius:10px;
          padding:17px;
          margin:18px 0;
          text-align:center;
        }

        .dp-award-formula > span {
          display:block;
          color:#d7ad63;
          font-size:10px;
          font-weight:900;
          letter-spacing:.8px;
          margin-bottom:9px;
        }

        .dp-award-formula > strong {
          display:block;
          color:#f3f5f7;
          font-size:16px;
        }

        .dp-award-formula p {
          color:#e9bd67;
          font-size:13px;
          font-weight:800;
          margin:12px 0;
        }

        .dp-award-formula b {
          color:#f5f6f8;
          padding:0 4px;
        }

        .dp-award-formula small {
          display:block;
          color:#aeb9c7;
          font-size:11px;
          line-height:1.7;
        }

        .dp-award-note {
          color:#97a5b5;
          font-size:11px;
        }

        .dp-award-unavailable {
          padding:18px 22px;
        }

        .dp-award-warning {
          color:#aab5c2;
          font-size:12px;
          margin-top:12px;
          line-height:1.7;
        }

        /* ==========================================
           MOBILE
           ========================================== */

        @media(max-width:750px) {

          .dp-champion-row {
            grid-template-columns:60px 1fr;
          }

          .dp-champion-row > div:nth-child(n+3) {
            grid-column:2;
          }

          .dp-award-header {
            padding:17px;
            gap:11px;
          }

          .dp-award-icon {
            width:40px;
            height:40px;
            font-size:20px;
          }

          .dp-award-identity h3 {
            font-size:17px;
          }

          .dp-award-number strong {
            font-size:25px;
          }

          .dp-award-stats strong {
            font-size:16px;
          }

          .dp-award-stats span {
            font-size:9px;
          }

          .dp-award-teaser {
            padding:13px 14px;
            gap:11px;
          }

          .dp-teaser-copy strong {
            font-size:13px;
          }

          .dp-teaser-copy small {
            font-size:11px;
          }

        }

        @media(max-width:420px) {

          .dp-award-stats {
            grid-template-columns:1fr;
          }

          .dp-award-stats > div {
            padding:12px;
          }

          .dp-award-header {
            flex-wrap:wrap;
          }

          .dp-teaser-icon {
            width:36px;
            height:36px;
            font-size:19px;
          }

          .dp-teaser-arrow {
            width:25px;
            height:25px;
            font-size:21px;
          }

        }

      `}</style>

    </main>
  );
}
