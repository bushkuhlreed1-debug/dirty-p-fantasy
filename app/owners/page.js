import Link from "next/link";
import { getLeagueData } from "../../lib/leagueData";

export const dynamic = "force-dynamic";

// =========================================================
// HELPERS
// =========================================================

function num(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function formatRecord(
  wins,
  losses,
  ties = 0
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

// =========================================================
// GAME RESULT
// =========================================================

function getOwnerGameResult(
  matchup,
  ownerId
) {
  const homeOwnerId =
    Number(
      matchup.home_owner_id
    );

  const awayOwnerId =
    Number(
      matchup.away_owner_id
    );

  const ownerNumber =
    Number(
      ownerId
    );

  const ownerIsHome =
    homeOwnerId ===
    ownerNumber;

  const ownerIsAway =
    awayOwnerId ===
    ownerNumber;

  if (
    !ownerIsHome &&
    !ownerIsAway
  ) {
    return null;
  }

  const winner =
    String(
      matchup.winner || ""
    ).toUpperCase();

  if (
    winner === "TIE"
  ) {
    return "tie";
  }

  if (
    ownerIsHome &&
    winner === "HOME"
  ) {
    return "win";
  }

  if (
    ownerIsHome &&
    winner === "AWAY"
  ) {
    return "loss";
  }

  if (
    ownerIsAway &&
    winner === "AWAY"
  ) {
    return "win";
  }

  if (
    ownerIsAway &&
    winner === "HOME"
  ) {
    return "loss";
  }

  // ---------------------------------------------------------
  // SCORE FALLBACK
  // ---------------------------------------------------------

  const homeScore =
    num(
      matchup.home_score
    );

  const awayScore =
    num(
      matchup.away_score
    );

  const ownerScore =
    ownerIsHome
      ? homeScore
      : awayScore;

  const opponentScore =
    ownerIsHome
      ? awayScore
      : homeScore;

  if (
    ownerScore >
    opponentScore
  ) {
    return "win";
  }

  if (
    ownerScore <
    opponentScore
  ) {
    return "loss";
  }

  return "tie";
}

// =========================================================
// GAME TYPE
// =========================================================

function getGameType(
  matchup
) {
  const matchupType =
    String(
      matchup.matchup_type ||
        ""
    )
      .trim()
      .toLowerCase();

  const playoffTier =
    String(
      matchup.playoff_tier ||
        ""
    )
      .trim()
      .toLowerCase();

  // =======================================================
  // CONSOLATION MUST COME FIRST
  // =======================================================

  if (
    matchupType.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "consolation"
    ) ||
    playoffTier.includes(
      "losers"
    ) ||
    playoffTier.includes(
      "loser"
    ) ||
    matchup.is_consolation ===
      true
  ) {
    return "consolation";
  }

  // =======================================================
  // CHAMPIONSHIP BRACKET
  // =======================================================

  if (
    matchupType ===
      "playoff" ||
    matchupType.includes(
      "championship"
    ) ||
    playoffTier.includes(
      "winners_bracket"
    ) ||
    playoffTier.includes(
      "winner"
    ) ||
    playoffTier.includes(
      "championship"
    ) ||
    matchup.is_championship ===
      true ||
    matchup.is_third_place ===
      true ||
    matchup.is_playoff ===
      true
  ) {
    return "playoff";
  }

  return "regular";
}

// =========================================================
// PAGE
// =========================================================

export default async function OwnersPage() {
  let leagueData;

  try {
    leagueData =
      await getLeagueData();
  } catch (error) {
    return (
      <main className="page-shell">

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


        <section className="owners-section">

          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  DATA ERROR
                </span>

                <h3>
                  Owners
                </h3>

                <p className="owner-team-name">
                  {error?.message ||
                    "Unable to load league data."}
                </p>

              </div>

            </div>

          </article>

        </section>

      </main>
    );
  }

  const {
    currentSeason,
    owners,
    currentTeams,
    seasonResults,
    matchups,
    completedCurrentMatchups,
    unmatchedEspnOwners,
  } =
    leagueData;

  // =========================================================
  // CURRENT ACTIVE OWNER IDS
  //
  // Anyone mapped to a 2026 ESPN team is considered active.
  // =========================================================

  const activeOwnerIds =
    new Set(
      currentTeams.map(
        (team) =>
          Number(
            team.owner_id
          )
      )
    );

  // =========================================================
  // CURRENT TEAM LOOKUP
  // =========================================================

  const currentTeamMap =
    new Map(
      currentTeams.map(
        (team) => [
          Number(
            team.owner_id
          ),
          team,
        ]
      )
    );

  // =========================================================
  // LATEST COMPLETED CURRENT WEEK
  // =========================================================

  const completedWeeks =
    completedCurrentMatchups
      .map(
        (game) =>
          Number(
            game.matchup_period
          )
      )
      .filter(
        (week) =>
          Number.isFinite(
            week
          ) &&
          week > 0
      );

  const latestCompletedWeek =
    completedWeeks.length >
    0
      ? Math.max(
          ...completedWeeks
        )
      : 0;

  // =========================================================
  // BUILD OWNER STATS
  // =========================================================

  const ownerStats =
    owners.map(
      (owner) => {
        const ownerId =
          Number(
            owner.id
          );

        const results =
          seasonResults.filter(
            (result) =>
              Number(
                result.owner_id
              ) ===
              ownerId
          );

        const currentTeam =
          currentTeamMap.get(
            ownerId
          );

        const active =
          activeOwnerIds.has(
            ownerId
          );

        // =====================================================
        // REGULAR-SEASON CAREER RECORD
        //
        // seasonResults already contains:
        // 2014–2025 from Supabase
        // +
        // live 2026 ESPN standings
        // =====================================================

        const regularWins =
          results.reduce(
            (
              total,
              result
            ) =>
              total +
              num(
                result.wins
              ),
            0
          );

        const regularLosses =
          results.reduce(
            (
              total,
              result
            ) =>
              total +
              num(
                result.losses
              ),
            0
          );

        const regularTies =
          results.reduce(
            (
              total,
              result
            ) =>
              total +
              num(
                result.ties
              ),
            0
          );

        // =====================================================
        // CAREER POINTS
        // =====================================================

        const pointsFor =
          results.reduce(
            (
              total,
              result
            ) =>
              total +
              num(
                result.points_for
              ),
            0
          );

        const pointsAgainst =
          results.reduce(
            (
              total,
              result
            ) =>
              total +
              num(
                result.points_against
              ),
            0
          );

        // =====================================================
        // POSTSEASON ACCOMPLISHMENTS
        // =====================================================

        const playoffAppearances =
          results.filter(
            (result) =>
              Boolean(
                result.playoff_appearance
              )
          ).length;

        const finalsAppearances =
          results.filter(
            (result) =>
              Boolean(
                result.championship_appearance
              )
          ).length;

        const championships =
          results.filter(
            (result) =>
              Boolean(
                result.champion
              )
          ).length;

        // =====================================================
        // OWNER MATCHUPS
        //
        // Historical games +
        // completed 2026 ESPN games.
        // =====================================================

        const ownerMatchups =
          matchups.filter(
            (matchup) =>
              Number(
                matchup.home_owner_id
              ) ===
                ownerId ||
              Number(
                matchup.away_owner_id
              ) ===
                ownerId
          );

        // =====================================================
        // PLAYOFF RECORD
        // =====================================================

        let playoffWins =
          0;

        let playoffLosses =
          0;

        let playoffTies =
          0;

        // =====================================================
        // CONSOLATION RECORD
        // =====================================================

        let consolationWins =
          0;

        let consolationLosses =
          0;

        let consolationTies =
          0;

        for (
          const matchup of
          ownerMatchups
        ) {
          const gameType =
            getGameType(
              matchup
            );

          if (
            gameType !==
              "playoff" &&
            gameType !==
              "consolation"
          ) {
            continue;
          }

          const result =
            getOwnerGameResult(
              matchup,
              ownerId
            );

          if (!result) {
            continue;
          }

          // ===================================================
          // PLAYOFFS
          // ===================================================

          if (
            gameType ===
            "playoff"
          ) {
            if (
              result === "win"
            ) {
              playoffWins +=
                1;
            }

            if (
              result === "loss"
            ) {
              playoffLosses +=
                1;
            }

            if (
              result === "tie"
            ) {
              playoffTies +=
                1;
            }

            continue;
          }

          // ===================================================
          // CONSOLATION
          // ===================================================

          if (
            result === "win"
          ) {
            consolationWins +=
              1;
          }

          if (
            result === "loss"
          ) {
            consolationLosses +=
              1;
          }

          if (
            result === "tie"
          ) {
            consolationTies +=
              1;
          }
        }

        // =====================================================
        // ALL-GAME RECORD
        // =====================================================

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

        const winPercentage =
          allGamesPlayed >
          0
            ? (
                (
                  allWins +
                  allTies *
                    0.5
                ) /
                allGamesPlayed
              ) *
              100
            : 0;

        // =====================================================
        // SEASON RANGE
        // =====================================================

        const seasonYears =
          results
            .map(
              (result) =>
                Number(
                  result.season_year
                )
            )
            .filter(
              Number.isFinite
            );

        const seasonsPlayed =
          new Set(
            seasonYears
          ).size;

        const firstSeason =
          seasonYears.length >
          0
            ? Math.min(
                ...seasonYears
              )
            : null;

        const latestSeason =
          seasonYears.length >
          0
            ? Math.max(
                ...seasonYears
              )
            : null;

        return {
          id:
            owner.id,

          name:
            owner.name,

          active,

          currentTeam:
            currentTeam
              ?.team_name ||
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
        };
      }
    );

  // =========================================================
  // SORT OWNERS
  //
  // ACTIVE FIRST
  // THEN TITLES
  // THEN REGULAR-SEASON WINS
  // =========================================================

  ownerStats.sort(
    (a, b) => {
      if (
        a.active !==
        b.active
      ) {
        return a.active
          ? -1
          : 1;
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

      if (
        b.regularWins !==
        a.regularWins
      ) {
        return (
          b.regularWins -
          a.regularWins
        );
      }

      return a.name.localeCompare(
        b.name
      );
    }
  );

  const activeOwners =
    ownerStats.filter(
      (owner) =>
        owner.active
    );

  const formerOwners =
    ownerStats.filter(
      (owner) =>
        !owner.active
    );

  // =========================================================
  // OWNER CARD
  // =========================================================

  function OwnerCard({
    owner,
  }) {
    return (
      <Link
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


          {owner.championships >
            0 && (

            <div className="owner-title-count">

              <strong>
                {owner.championships}
              </strong>

              <span>

                {owner.championships ===
                1
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

              {owner.winPercentage.toFixed(
                1
              )}
              %

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

      </Link>
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
            THE LEAGUE
          </p>

          <h1>
            Owners
          </h1>

          <p>
            The complete career history
            of everyone who has competed
            in Dirty P Fantasy Football,
            updated throughout the current
            season.
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

        <Link href="/">
          ← Home
        </Link>

        <span>

          {latestCompletedWeek >
          0
            ? `Career records through ${currentSeason} Week ${latestCompletedWeek}`
            : `Career records through ${currentSeason}`}

        </span>

      </div>


      {/* ESPN MATCH WARNING */}

      {unmatchedEspnOwners.length >
        0 && (

        <section className="owners-section">

          <article className="owner-card">

            <div className="owner-card-top">

              <div>

                <span className="owner-status">
                  ESPN OWNER MATCH WARNING
                </span>

                <h3>
                  Some current owners could not be matched
                </h3>

                <p className="owner-team-name">

                  {unmatchedEspnOwners
                    .map(
                      (owner) =>
                        `${owner.ownerName} (${owner.teamName})`
                    )
                    .join(", ")}

                </p>

              </div>

            </div>

          </article>

        </section>

      )}


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
                key={
                  owner.id
                }
                owner={
                  owner
                }
              />

            )
          )}

        </div>

      </section>


      {/* FORMER OWNERS */}

      {formerOwners.length >
        0 && (

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
                  key={
                    owner.id
                  }
                  owner={
                    owner
                  }
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
