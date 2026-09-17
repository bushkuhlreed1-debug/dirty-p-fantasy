import { supabase } from "../../lib/supabase";

export default async function OwnersPage() {
  const currentSeason = 2026;

  // =========================================================
  // GET OWNERS
  // =========================================================

  const { data: owners, error: ownersError } =
    await supabase
      .from("owners")
      .select(`
        id,
        name,
        current_team_name,
        active
      `)
      .order("name", { ascending: true });

  // =========================================================
  // GET REGULAR SEASON RESULTS
  // =========================================================

  const {
    data: seasonResults,
    error: resultsError,
  } = await supabase
    .from("season_results")
    .select(`
      season_year,
      owner_id,
      wins,
      losses,
      ties,
      points_for,
      points_against,
      playoff_appearance,
      championship_appearance,
      champion
    `);

  // =========================================================
  // GET ALL HISTORICAL MATCHUPS
  // =========================================================

  const {
    data: allMatchups,
    error: matchupsError,
  } = await supabase
    .from("matchups")
    .select(`
      id,
      season_year,
      matchup_period,
      matchup_type,
      playoff_tier,
      home_owner_id,
      away_owner_id,
      home_score,
      away_score,
      winner,
      is_playoff,
      is_championship,
      is_third_place
    `);

  // =========================================================
  // GET CURRENT TEAM NAMES
  // =========================================================

  const {
    data: currentTeams,
    error: teamsError,
  } = await supabase
    .from("teams")
    .select(`
      owner_id,
      team_name
    `)
    .eq("season_year", currentSeason);

  // =========================================================
  // DATABASE ERROR
  // =========================================================

  if (
    ownersError ||
    resultsError ||
    matchupsError ||
    teamsError
  ) {
    return (
      <main className="page-shell">
        <h1>Owners</h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            resultsError?.message ||
            matchupsError?.message ||
            teamsError?.message}
        </p>
      </main>
    );
  }

  // =========================================================
  // DETERMINE GAME RESULT
  // =========================================================

  function getOwnerGameResult(matchup, ownerId) {
    const homeScore = Number(
      matchup.home_score ?? 0
    );

    const awayScore = Number(
      matchup.away_score ?? 0
    );

    const ownerIsHome =
      matchup.home_owner_id === ownerId;

    const ownerIsAway =
      matchup.away_owner_id === ownerId;

    if (!ownerIsHome && !ownerIsAway) {
      return null;
    }

    const ownerScore = ownerIsHome
      ? homeScore
      : awayScore;

    const opponentScore = ownerIsHome
      ? awayScore
      : homeScore;

    if (ownerScore > opponentScore) {
      return "win";
    }

    if (ownerScore < opponentScore) {
      return "loss";
    }

    return "tie";
  }

  // =========================================================
  // NORMALIZE TEXT
  // =========================================================

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  // =========================================================
  // IDENTIFY POSTSEASON TYPE
  //
  // We deliberately make this more comprehensive than the
  // previous version.
  //
  // Consolation is checked FIRST so consolation games do not
  // get counted as championship-bracket playoff games.
  // =========================================================

  function getPostseasonType(matchup) {
    const matchupType =
      normalize(matchup.matchup_type);

    const playoffTier =
      normalize(matchup.playoff_tier);

    const combined =
      `${matchupType} ${playoffTier}`;

    // =======================================================
    // CONSOLATION / LOSERS BRACKET
    // =======================================================

    const isConsolation =
      matchupType.includes("consolation") ||
      matchupType.includes("loser") ||
      matchupType.includes("losers") ||
      matchupType.includes("5th_place") ||
      matchupType.includes("7th_place") ||
      playoffTier.includes("consolation") ||
      playoffTier.includes("loser") ||
      playoffTier.includes("losers") ||
      playoffTier.includes("consolation_bracket");

    if (isConsolation) {
      return "consolation";
    }

    // =======================================================
    // EXPLICIT CHAMPIONSHIP / THIRD PLACE
    // =======================================================

    if (
      matchup.is_championship === true ||
      matchup.is_third_place === true
    ) {
      return "playoff";
    }

    // =======================================================
    // EXPLICIT PLAYOFF FLAGS
    // =======================================================

    if (matchup.is_playoff === true) {
      return "playoff";
    }

    // =======================================================
    // PLAYOFF MATCHUP TYPES
    // =======================================================

    const playoffKeywords = [
      "playoff",
      "playoffs",
      "championship",
      "championship_game",
      "final",
      "finals",
      "semifinal",
      "semi_final",
      "semi",
      "quarterfinal",
      "quarter_final",
      "quarter",
      "wild_card",
      "wildcard",
      "first_round",
      "second_round",
      "third_round",
      "round_1",
      "round_2",
      "round_3",
      "third_place",
      "3rd_place",
      "runner_up",
      "winner_bracket",
      "winners_bracket",
      "winners",
      "upper_bracket",
      "upper",
      "championship_bracket",
    ];

    const hasPlayoffKeyword =
      playoffKeywords.some(
        (keyword) =>
          matchupType.includes(keyword) ||
          playoffTier.includes(keyword)
      );

    if (hasPlayoffKeyword) {
      return "playoff";
    }

    // =======================================================
    // ADDITIONAL PLAYOFF-TIER DETECTION
    // =======================================================

    if (
      combined.includes("bracket") &&
      !combined.includes("consolation") &&
      !combined.includes("loser")
    ) {
      return "playoff";
    }

    return "regular";
  }

  // =========================================================
  // BUILD CAREER STATS
  // =========================================================

  const ownerStats = (owners || []).map(
    (owner) => {
      const results = (
        seasonResults || []
      ).filter(
        (result) =>
          result.owner_id === owner.id
      );

      const currentTeam = (
        currentTeams || []
      ).find(
        (team) =>
          team.owner_id === owner.id
      );

      // =======================================================
      // REGULAR SEASON RECORD
      // =======================================================

      const regularWins =
        results.reduce(
          (total, result) =>
            total +
            Number(result.wins || 0),
          0
        );

      const regularLosses =
        results.reduce(
          (total, result) =>
            total +
            Number(result.losses || 0),
          0
        );

      const regularTies =
        results.reduce(
          (total, result) =>
            total +
            Number(result.ties || 0),
          0
        );

      // =======================================================
      // REGULAR SEASON POINTS
      // =======================================================

      const pointsFor =
        results.reduce(
          (total, result) =>
            total +
            Number(result.points_for || 0),
          0
        );

      const pointsAgainst =
        results.reduce(
          (total, result) =>
            total +
            Number(result.points_against || 0),
          0
        );

      // =======================================================
      // ACCOMPLISHMENTS
      // =======================================================

      const playoffAppearances =
        results.filter(
          (result) =>
            result.playoff_appearance === true
        ).length;

      const finalsAppearances =
        results.filter(
          (result) =>
            result.championship_appearance === true
        ).length;

      const championships =
        results.filter(
          (result) =>
            result.champion === true
        ).length;

      // =======================================================
      // ALL MATCHUPS FOR OWNER
      // =======================================================

      const ownerMatchups = (
        allMatchups || []
      ).filter(
        (matchup) =>
          matchup.home_owner_id === owner.id ||
          matchup.away_owner_id === owner.id
      );

      // =======================================================
      // PLAYOFF RECORD
      // =======================================================

      let playoffWins = 0;
      let playoffLosses = 0;
      let playoffTies = 0;

      // =======================================================
      // CONSOLATION RECORD
      // =======================================================

      let consolationWins = 0;
      let consolationLosses = 0;
      let consolationTies = 0;

      // =======================================================
      // TRACK PLAYOFF GAMES BY SEASON
      //
      // This is useful for making sure we aren't accidentally
      // counting the same matchup twice.
      // =======================================================

      const playoffGamesBySeason = {};

      ownerMatchups.forEach(
        (matchup) => {
          const gameType =
            getPostseasonType(matchup);

          if (
            gameType !== "playoff" &&
            gameType !== "consolation"
          ) {
            return;
          }

          const gameResult =
            getOwnerGameResult(
              matchup,
              owner.id
            );

          if (!gameResult) {
            return;
          }

          // =====================================================
          // PLAYOFF GAME
          // =====================================================

          if (gameType === "playoff") {
            if (gameResult === "win") {
              playoffWins += 1;
            }

            if (gameResult === "loss") {
              playoffLosses += 1;
            }

            if (gameResult === "tie") {
              playoffTies += 1;
            }

            const season =
              matchup.season_year;

            if (
              !playoffGamesBySeason[season]
            ) {
              playoffGamesBySeason[season] = [];
            }

            playoffGamesBySeason[season].push(
              matchup.id
            );

            return;
          }

          // =====================================================
          // CONSOLATION GAME
          // =====================================================

          if (gameType === "consolation") {
            if (gameResult === "win") {
              consolationWins += 1;
            }

            if (gameResult === "loss") {
              consolationLosses += 1;
            }

            if (gameResult === "tie") {
              consolationTies += 1;
            }
          }
        }
      );

      // =======================================================
      // ALL-GAME RECORD
      // =======================================================

      const allWins =
        regularWins +
        playoffWins +
        consolationWins;

      const allLosses =
        regularLosses +
        playoffLosses +
        consolationLosses;

      const allTies =
        regularTies +
        playoffTies +
        consolationTies;

      const allGamesPlayed =
        allWins +
        allLosses +
        allTies;

      // =======================================================
      // ALL-GAME WIN %
      // =======================================================

      const winPercentage =
        allGamesPlayed > 0
          ? (
              (
                allWins +
                allTies * 0.5
              ) /
              allGamesPlayed
            ) * 100
          : 0;

      // =======================================================
      // SEASONS PLAYED
      // =======================================================

      const seasonsPlayed =
        results.length;

      const firstSeason =
        results.length > 0
          ? Math.min(
              ...results.map(
                (result) =>
                  result.season_year
              )
            )
          : null;

      const latestSeason =
        results.length > 0
          ? Math.max(
              ...results.map(
                (result) =>
                  result.season_year
              )
            )
          : null;

      return {
        ...owner,

        currentTeam:
          currentTeam?.team_name ||
          owner.current_team_name ||
          null,

        regularWins,
        regularLosses,
        regularTies,

        playoffWins,
        playoffLosses,
        playoffTies,

        consolationWins,
        consolationLosses,
        consolationTies,

        allWins,
        allLosses,
        allTies,
        allGamesPlayed,

        pointsFor,
        pointsAgainst,

        playoffAppearances,
        finalsAppearances,
        championships,

        winPercentage,

        seasonsPlayed,
        firstSeason,
        latestSeason,

        playoffGamesBySeason,
      };
    }
  );

  // =========================================================
  // SORT OWNERS
  // =========================================================

  ownerStats.sort(
    (a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }

      if (
        b.championships !==
        a.championships
      ) {
        return (
          b.championships -
          a.championships
        );
      }

      return (
        b.regularWins -
        a.regularWins
      );
    }
  );

  const activeOwners =
    ownerStats.filter(
      (owner) => owner.active
    );

  const formerOwners =
    ownerStats.filter(
      (owner) => !owner.active
    );

  // =========================================================
  // RECORD FORMATTER
  // =========================================================

  function formatRecord(
    wins,
    losses,
    ties
  ) {
    if (ties > 0) {
      return `${wins}-${losses}-${ties}`;
    }

    return `${wins}-${losses}`;
  }

  // =========================================================
  // OWNER CARD
  // =========================================================

  function OwnerCard({ owner }) {
    return (
      <a
        className="owner-card"
        href={`/owners/${owner.id}`}
      >

        {/* OWNER HEADER */}

        <div className="owner-card-top">

          <div>

            <span className="owner-status">
              {owner.active
                ? "ACTIVE OWNER"
                : "FORMER OWNER"}
            </span>

            <h3>
              {owner.name}
            </h3>

            {owner.currentTeam && (
              <p className="owner-team-name">
                {owner.currentTeam}
              </p>
            )}

          </div>

          {owner.championships > 0 && (
            <div className="owner-title-count">

              <strong>
                {owner.championships}
              </strong>

              <span>
                {owner.championships === 1
                  ? "TITLE"
                  : "TITLES"}
              </span>

            </div>
          )}

        </div>


        {/* REGULAR SEASON + WIN % */}

        <div className="owner-record">

          <div>

            <strong>
              {formatRecord(
                owner.regularWins,
                owner.regularLosses,
                owner.regularTies
              )}
            </strong>

            <span>
              REGULAR SEASON RECORD
            </span>

          </div>

          <div>

            <strong>
              {owner.winPercentage.toFixed(1)}%
            </strong>

            <span>
              ALL-GAME WIN %
            </span>

          </div>

        </div>


        {/* PLAYOFF + CONSOLATION */}

        <div className="owner-record">

          <div>

            <strong>
              {formatRecord(
                owner.playoffWins,
                owner.playoffLosses,
                owner.playoffTies
              )}
            </strong>

            <span>
              PLAYOFF RECORD
            </span>

          </div>

          <div>

            <strong>
              {formatRecord(
                owner.consolationWins,
                owner.consolationLosses,
                owner.consolationTies
              )}
            </strong>

            <span>
              CONSOLATION RECORD
            </span>

          </div>

        </div>


        {/* CAREER ACCOMPLISHMENTS */}

        <div className="owner-stats-grid">

          <div>

            <strong>
              {owner.seasonsPlayed}
            </strong>

            <span>
              Seasons
            </span>

          </div>

          <div>

            <strong>
              {owner.playoffAppearances}
            </strong>

            <span>
              Playoffs
            </span>

          </div>

          <div>

            <strong>
              {owner.finalsAppearances}
            </strong>

            <span>
              Finals
            </span>

          </div>

          <div>

            <strong>
              {owner.championships}
            </strong>

            <span>
              Titles
            </span>

          </div>

        </div>


        {/* BOTTOM */}

        <div className="owner-card-bottom">

          <span>
            {owner.firstSeason &&
            owner.latestSeason
              ? `${owner.firstSeason}–${owner.latestSeason}`
              : "No seasons"}
          </span>

          <strong>
            View Owner →
          </strong>

        </div>

      </a>
    );
  }

  // =========================================================
  // PAGE
  // =========================================================

  return (
    <main className="page-shell">

      {/* HEADER */}

      <header className="site-header">

        <div className="site-title">

          <a href="/">
            <strong>
              DIRTY P FANTASY FOOTBALL
            </strong>
          </a>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>

        </div>

      </header>


      {/* HERO */}

      <section className="owners-hero">

        <div>

          <p className="eyebrow">
            THE LEAGUE
          </p>

          <h1>
            Owners
          </h1>

          <p>
            The complete history of everyone
            who has competed in Dirty P
            Fantasy Football.
          </p>

        </div>

        <div className="owners-count">

          <strong>
            {ownerStats.length}
          </strong>

          <span>
            ALL-TIME OWNERS
          </span>

        </div>

      </section>


      {/* PAGE NAV */}

      <div className="page-nav">

        <a href="/">
          ← Home
        </a>

        <span>
          Career records through {currentSeason}
        </span>

      </div>


      {/* ACTIVE OWNERS */}

      <section className="owners-section">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              CURRENT LEAGUE
            </p>

            <h2>
              Active Owners
            </h2>

          </div>

          <span>
            {activeOwners.length} Owners
          </span>

        </div>

        <div className="owners-grid">

          {activeOwners.map(
            (owner) => (
              <OwnerCard
                key={owner.id}
                owner={owner}
              />
            )
          )}

        </div>

      </section>


      {/* FORMER OWNERS */}

      {formerOwners.length > 0 && (
        <section className="owners-section former-owners-section">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                LEAGUE HISTORY
              </p>

              <h2>
                Former Owners
              </h2>

            </div>

            <span>
              {formerOwners.length} Owners
            </span>

          </div>

          <div className="owners-grid">

            {formerOwners.map(
              (owner) => (
                <OwnerCard
                  key={owner.id}
                  owner={owner}
                />
              )
            )}

          </div>

        </section>
      )}


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

    </main>
  );
}
