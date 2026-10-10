import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const CURRENT_SEASON = 2026;

// Dominance score weighting
const WEIGHTS = {
  REGULAR_SEASON: 0.4,
  SCORING: 0.35,
  POSTSEASON: 0.25,
};

// ======================================================
// HELPERS
// ======================================================

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function formatNumber(value, digits = 1) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function seasonGamesPlayed(result) {
  return (
    num(result?.wins) +
    num(result?.losses) +
    num(result?.ties)
  );
}

function regularWinPct(result) {
  const games = seasonGamesPlayed(result);

  if (!games) return null;

  return (
    (num(result.wins) + num(result.ties) * 0.5) /
    games
  );
}

// ======================================================
// SUPABASE PAGINATION
//
// Fetch all historical records, even if a table
// contains more than Supabase's default row limit.
// ======================================================

async function fetchAll(table, columns = "*") {
  const records = [];
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .lt("season_year", CURRENT_SEASON)
      .order("season_year", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);

    const batch = data || [];
    records.push(...batch);

    if (batch.length < pageSize) break;
  }

  return records;
}

// ======================================================
// CHAMPIONSHIP-BRACKET GAME DETECTION
//
// Include semifinals and championship games.
//
// Exclude third-place and consolation games,
// even if ESPN marks them as playoff games.
// ======================================================

function getPlayoffRound(game) {
  const type = normalize(game.matchup_type);
  const tier = normalize(game.playoff_tier);

  if (
    game.is_third_place === true ||
    type.includes("third_place") ||
    type.includes("3rd_place") ||
    type.includes("bronze")
  ) {
    return null;
  }

  if (
    game.is_consolation === true ||
    type.includes("consolation") ||
    type.includes("loser") ||
    type.includes("toilet") ||
    tier.includes("consolation") ||
    tier.includes("loser") ||
    tier.includes("toilet")
  ) {
    return null;
  }

  if (
    game.is_championship === true ||
    type === "championship" ||
    type === "championship_game" ||
    type === "final" ||
    type === "finals" ||
    type === "title_game"
  ) {
    return "championship";
  }

  if (
    type.includes("semifinal") ||
    type.includes("semi_final") ||
    type === "opening_round" ||
    type === "first_round" ||
    type === "playoff" ||
    type === "playoffs"
  ) {
    return "semifinal";
  }

  if (
    game.is_playoff === true &&
    (
      tier === "winners_bracket" ||
      tier === "winner_bracket" ||
      tier === "championship_bracket"
    )
  ) {
    return "semifinal";
  }

  return null;
}

function getWinningOwnerId(game) {
  const homeId = Number(game.home_owner_id);
  const awayId = Number(game.away_owner_id);

  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") return homeId;
  if (winner === "AWAY") return awayId;
  if (winner === "TIE") return null;

  if (
    !validNumber(game.home_score) ||
    !validNumber(game.away_score)
  ) {
    return null;
  }

  if (num(game.home_score) > num(game.away_score)) {
    return homeId;
  }

  if (num(game.away_score) > num(game.home_score)) {
    return awayId;
  }

  return null;
}

function getWinnerMargin(game, ownerId) {
  if (
    !validNumber(game.home_score) ||
    !validNumber(game.away_score)
  ) {
    return null;
  }

  if (getWinningOwnerId(game) !== ownerId) {
    return null;
  }

  if (Number(game.home_owner_id) === ownerId) {
    return (
      num(game.home_score) -
      num(game.away_score)
    );
  }

  return (
    num(game.away_score) -
    num(game.home_score)
  );
}

// ======================================================
// MOST DOMINANT CHAMPION
//
// Score categories:
//
// 40% - Regular-season winning percentage
//
// 35% - Scoring versus that year's league average
//
// 25% - Championship-bracket winning margins,
//       relative to that year's average scoring
//
// Minimum data required:
// - Champion's regular-season results
// - League-wide regular-season scoring data
// - Winning semifinal and championship games
//   with recorded final scores
//
// Missing data is NOT treated as zero performance.
// ======================================================

function calculateDominance(history, results, games) {
  const resultsByYear = new Map();
  const gamesByYear = new Map();

  for (const result of results) {
    const year = Number(result.season_year);

    if (!resultsByYear.has(year)) {
      resultsByYear.set(year, []);
    }

    resultsByYear.get(year).push(result);
  }

  for (const game of games) {
    const year = Number(game.season_year);

    if (!gamesByYear.has(year)) {
      gamesByYear.set(year, []);
    }

    gamesByYear.get(year).push(game);
  }

  return history.map((season) => {
    const year = Number(season.year);
    const championId = Number(season.champion?.id);

    const seasonResults = resultsByYear.get(year) || [];
    const seasonMatchups = gamesByYear.get(year) || [];

    const championResult = seasonResults.find(
      (result) =>
        Number(result.owner_id) === championId
    );

    const missing = [];

    if (!championResult || !seasonGamesPlayed(championResult)) {
      missing.push("regular-season record");
    }

    const scoredTeams = seasonResults
      .filter(
        (result) =>
          seasonGamesPlayed(result) > 0 &&
          validNumber(result.points_for)
      )
      .map((result) => ({
        ownerId: Number(result.owner_id),
        pointsPerGame:
          num(result.points_for) /
          seasonGamesPlayed(result),
      }));

    const leagueAverage =
      scoredTeams.length > 0
        ? scoredTeams.reduce(
            (sum, team) => sum + team.pointsPerGame,
            0
          ) / scoredTeams.length
        : null;

    if (
      !leagueAverage ||
      scoredTeams.length < 2 ||
      !validNumber(championResult?.points_for)
    ) {
      missing.push("league scoring data");
    }

    const championPlayoffGames = seasonMatchups
      .filter((game) => {
        const round = getPlayoffRound(game);

        return (
          round !== null &&
          getWinningOwnerId(game) === championId
        );
      });

    const semifinalGames = championPlayoffGames.filter(
      (game) => getPlayoffRound(game) === "semifinal"
    );

    const championshipGames = championPlayoffGames.filter(
      (game) => getPlayoffRound(game) === "championship"
    );

    const semifinal = semifinalGames[0];
    const championship = championshipGames[0];

    const semifinalMargin = semifinal
      ? getWinnerMargin(semifinal, championId)
      : null;

    const championshipMargin = championship
      ? getWinnerMargin(championship, championId)
      : null;

    if (
      semifinalMargin === null ||
      championshipMargin === null
    ) {
      missing.push("complete postseason scores");
    }

    const eligible = missing.length === 0;

    const winPct = championResult
      ? regularWinPct(championResult)
      : null;

    const championPPG =
      championResult &&
      seasonGamesPlayed(championResult) > 0 &&
      validNumber(championResult.points_for)
        ? num(championResult.points_for) /
          seasonGamesPlayed(championResult)
        : null;

    const scoringRatio =
      championPPG !== null && leagueAverage
        ? championPPG / leagueAverage
        : null;

    const averagePlayoffMargin =
      semifinalMargin !== null &&
      championshipMargin !== null
        ? (semifinalMargin + championshipMargin) / 2
        : null;

    let dominanceScore = null;

    if (eligible) {
      // Win % already has a natural 0-100 scale.
      const regularScore = winPct * 100;

      // A champion scoring 25% above league average
      // earns full scoring marks.
      const scoringScore = clamp(
        (scoringRatio / 1.25) * 100
      );

      // A champion winning playoff games by an
      // average of 40% of that year's typical
      // team score earns full postseason marks.
      const postseasonScore = clamp(
        (
          averagePlayoffMargin /
          (leagueAverage * 0.4)
        ) * 100
      );

      dominanceScore =
        regularScore * WEIGHTS.REGULAR_SEASON +
        scoringScore * WEIGHTS.SCORING +
        postseasonScore * WEIGHTS.POSTSEASON;
    }

    return {
      year,
      season,
      championResult,
      winPct,
      championPPG,
      leagueAverage,
      scoringRatio,
      semifinalMargin,
      championshipMargin,
      averagePlayoffMargin,
      dominanceScore,
      eligible,
      missing,
    };
  });
}

// ======================================================
// CHAMPIONS PAGE
// ======================================================

export default async function ChampionsPage() {
  let history = [];
  let teamHistory = [];
  let seasonResults = [];
  let historicalMatchups = [];

  try {
    const [
      seasonsResponse,
      teamsResponse,
      results,
      games,
    ] = await Promise.all([
      supabase
        .from("seasons")
        .select(`
          year,
          championship_score,
          champion:champion_owner_id (
            id,
            name
          ),
          runner_up:runner_up_owner_id (
            id,
            name
          )
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

    if (seasonsResponse.error) {
      throw new Error(seasonsResponse.error.message);
    }

    if (teamsResponse.error) {
      throw new Error(teamsResponse.error.message);
    }

    history = seasonsResponse.data || [];
    teamHistory = teamsResponse.data || [];
    seasonResults = results;
    historicalMatchups = games;
  } catch (error) {
    return (
      <main className="page-shell">
        <h1>Champions</h1>
        <p>
          Unable to load championship history:{" "}
          {error?.message || "Database error"}
        </p>
      </main>
    );
  }

  const teamMap = new Map(
    teamHistory.map((team) => [
      `${team.season_year}:${team.owner_id}`,
      team.team_name,
    ])
  );

  function getTeamName(year, ownerId) {
    return (
      teamMap.get(`${year}:${ownerId}`) ||
      "Team name unavailable"
    );
  }

  const dominanceResults = calculateDominance(
    history,
    seasonResults,
    historicalMatchups
  );

  const eligibleChampions = dominanceResults
    .filter((entry) => entry.eligible)
    .sort(
      (a, b) =>
        b.dominanceScore - a.dominanceScore ||
        b.winPct - a.winPct ||
        a.year - b.year
    );

  const dominantChampion =
    eligibleChampions[0] || null;

  const incompleteCount = dominanceResults.filter(
    (entry) => !entry.eligible
  ).length;

  const years = history
    .map((season) => Number(season.year))
    .filter(Number.isFinite);

  const firstSeason = years.length
    ? Math.min(...years)
    : 2014;

  const latestSeason = years.length
    ? Math.max(...years)
    : 2025;

  return (
    <main className="page-shell">
      {/* SITE HEADER */}

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

      {/* PAGE INTRODUCTION */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            THE LEAGUE ARCHIVE
          </p>

          <h1>Champions</h1>

          <p>
            Every Dirty P champion since 2014,
            and the greatest championship season
            in league history.
          </p>
        </div>

        <div className="owners-count">
          <strong>{history.length}</strong>
          <span>CHAMPIONSHIPS</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>

        <span>
          {firstSeason}–{latestSeason}
        </span>
      </nav>

      {/* MOST DOMINANT CHAMPION EVER */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE GREATEST CHAMPIONSHIP SEASON
            </p>

            <h2>Most Dominant Champion Ever</h2>
          </div>
        </div>

        {dominantChampion ? (
          <article className="dominant-card">
            <div className="dominant-card-top">
              <div>
                <span className="dominant-eyebrow">
                  ALL-TIME MOST DOMINANT CHAMPION
                </span>

                <h3>
                  {dominantChampion.season.champion.name}
                </h3>

                <p>
                  {getTeamName(
                    dominantChampion.year,
                    dominantChampion.season.champion.id
                  )}
                </p>

                <span className="dominant-year">
                  {dominantChampion.year} CHAMPION
                </span>
              </div>

              <div className="dominant-trophy">
                <span>🏆</span>
                <strong>
                  {formatNumber(
                    dominantChampion.dominanceScore
                  )}
                </strong>
                <small>DOMINANCE SCORE</small>
              </div>
            </div>

            <div className="dominant-stats">
              <div>
                <strong>
                  {dominantChampion.championResult.wins}-
                  {dominantChampion.championResult.losses}
                  {num(dominantChampion.championResult.ties) > 0
                    ? `-${dominantChampion.championResult.ties}`
                    : ""}
                </strong>
                <span>REGULAR-SEASON RECORD</span>
              </div>

              <div>
                <strong>
                  {formatNumber(
                    dominantChampion.championPPG
                  )}
                </strong>
                <span>POINTS PER GAME</span>
              </div>

              <div>
                <strong>
                  +
                  {formatNumber(
                    dominantChampion.averagePlayoffMargin
                  )}
                </strong>
                <span>AVG. PLAYOFF WIN MARGIN</span>
              </div>
            </div>

            <div className="dominant-footer">
              <span>
                Ranked using regular-season winning
                percentage (40%), scoring compared
                with that year's league (35%), and
                semifinal/championship winning
                margins (25%).
              </span>
            </div>
          </article>
        ) : (
          <article className="owner-card">
            <div className="owner-card-top">
              <div>
                <span className="owner-status">
                  HISTORICAL DATA
                </span>

                <h3>
                  Dominance ranking unavailable
                </h3>

                <p className="owner-team-name">
                  Complete regular-season records,
                  league-wide scoring, and both
                  playoff-game scores are needed
                  to calculate this award.
                </p>
              </div>
            </div>
          </article>
        )}

        {incompleteCount > 0 && (
          <p className="dominant-note">
            {incompleteCount} championship{" "}
            {incompleteCount === 1
              ? "season is"
              : "seasons are"}{" "}
            missing data required for the comparison.
            The award currently ranks only seasons
            with complete records and postseason scores.
          </p>
        )}
      </section>

      {/* YEAR-BY-YEAR CHAMPIONS */}

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>Championship History</h2>
          </div>

          <span>
            {history.length} Seasons
          </span>
        </div>

        <div className="championship-history">
          {history.map((season) => {
            const champion = season.champion;
            const runnerUp = season.runner_up;

            const championTeam = getTeamName(
              season.year,
              champion?.id
            );

            const runnerUpTeam = getTeamName(
              season.year,
              runnerUp?.id
            );

            return (
              <article
                className="championship-row"
                key={season.year}
              >
                <div className="championship-year">
                  {season.year}
                </div>

                <div className="championship-winner">
                  <span className="championship-label">
                    🏆 LEAGUE CHAMPION
                  </span>

                  {champion?.id ? (
                    <Link
                      href={`/owners/${champion.id}`}
                    >
                      {champion.name}
                    </Link>
                  ) : (
                    <strong>
                      {champion?.name || "—"}
                    </strong>
                  )}

                  <span className="championship-team">
                    {championTeam}
                  </span>
                </div>

                <div className="championship-final">
                  <strong>
                    {season.championship_score || "—"}
                  </strong>

                  <span>
                    FINAL SCORE
                  </span>
                </div>

                <div className="championship-runnerup">
                  <span>RUNNER-UP</span>

                  <strong>
                    {runnerUp?.name || "—"}
                  </strong>

                  <small>{runnerUpTeam}</small>
                </div>
              </article>
            );
          })}
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

      {/* CHAMPIONS PAGE STYLING */}

      <style>{`
        .dominant-card {
          overflow: hidden;
          background: #171d26;
          border: 1px solid #806539;
          border-radius: 16px;
          box-shadow: 0 0 0 1px rgba(233,189,103,.08);
        }

        .dominant-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 22px;
          padding: 28px;
        }

        .dominant-eyebrow {
          display: block;
          color: #e9bd67;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.4px;
          margin-bottom: 12px;
        }

        .dominant-card h3 {
          margin: 0;
          color: #f5f6f8;
          font-size: clamp(23px, 4vw, 34px);
          line-height: 1.2;
        }

        .dominant-card-top p {
          margin: 9px 0 14px;
          color: #adb8c5;
          font-size: 15px;
        }

        .dominant-year {
          color: #d8b57a;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .dominant-trophy {
          min-width: 135px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          color: #e9bd67;
        }

        .dominant-trophy > span {
          font-size: 35px;
        }

        .dominant-trophy strong {
          font-size: 34px;
          font-weight: 900;
          line-height: 1.15;
        }

        .dominant-trophy small {
          font-size: 9px;
          letter-spacing: 1px;
          font-weight: 800;
        }

        .dominant-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          background: #303947;
          border-top: 1px solid #303947;
          border-bottom: 1px solid #303947;
        }

        .dominant-stats > div {
          background: #1c2430;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 9px;
          padding: 22px 10px;
          text-align: center;
        }

        .dominant-stats strong {
          color: #f5f6f8;
          font-size: clamp(18px, 3vw, 26px);
          font-weight: 850;
        }

        .dominant-stats span {
          color: #a0adbd;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .7px;
          line-height: 1.4;
        }

        .dominant-footer {
          padding: 17px 22px;
          color: #a7b3c2;
          font-size: 12px;
          line-height: 1.7;
          text-align: center;
        }

        .dominant-note {
          color: #a5b0be;
          font-size: 12px;
          line-height: 1.6;
          margin: 13px 2px 0;
        }

        .championship-history {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .championship-row {
          display: grid;
          grid-template-columns:
            80px minmax(0, 1.5fr)
            minmax(110px, .8fr)
            minmax(0, 1fr);
          align-items: center;
          gap: 18px;
          padding: 20px;
          border: 1px solid #303947;
          border-radius: 12px;
          background: #171d26;
        }

        .championship-year {
          color: #e9bd67;
          font-size: 22px;
          font-weight: 900;
        }

        .championship-winner,
        .championship-final,
        .championship-runnerup {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .championship-label {
          color: #d3b47b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .8px;
        }

        .championship-winner a,
        .championship-winner > strong {
          color: #f5f6f8;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.3;
          text-decoration: none;
        }

        .championship-winner a:hover {
          color: #e9bd67;
        }

        .championship-team {
          color: #9daab8;
          font-size: 12px;
        }

        .championship-final strong {
          color: #f5f6f8;
          font-size: 16px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        .championship-final span,
        .championship-runnerup > span {
          color: #929ead;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .6px;
        }

        .championship-runnerup strong {
          color: #dce1e7;
          font-size: 13px;
          line-height: 1.4;
        }

        .championship-runnerup small {
          color: #8c99a8;
          font-size: 11px;
        }

        @media (max-width: 740px) {
          .dominant-card-top {
            padding: 23px 18px;
          }

          .dominant-trophy {
            align-items: flex-start;
          }

          .championship-row {
            grid-template-columns:
              64px minmax(0, 1fr);
            gap: 14px;
            padding: 17px 14px;
          }

          .championship-final {
            grid-column: 2;
          }

          .championship-runnerup {
            grid-column: 2;
          }
        }

        @media (max-width: 450px) {
          .dominant-stats > div {
            padding: 16px 5px;
          }

          .dominant-stats strong {
            font-size: 17px;
          }

          .dominant-stats span {
            font-size: 9px;
          }

          .championship-year {
            font-size: 19px;
          }
        }
      `}</style>
    </main>
  );
}
