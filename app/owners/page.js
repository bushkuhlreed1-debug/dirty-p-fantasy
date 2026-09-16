import { supabase } from "../../lib/supabase";

export default async function OwnersPage() {
  const currentSeason = 2026;

  // =========================
  // GET OWNERS
  // =========================

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

  // =========================
  // GET ALL SEASON RESULTS
  // =========================

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

  // =========================
  // GET CURRENT TEAM NAMES
  // =========================

  const { data: currentTeams, error: teamsError } =
    await supabase
      .from("teams")
      .select(`
        owner_id,
        team_name
      `)
      .eq("season_year", currentSeason);

  // =========================
  // DATABASE ERROR
  // =========================

  if (
    ownersError ||
    resultsError ||
    teamsError
  ) {
    return (
      <main className="page-shell">
        <h1>Owners</h1>

        <p>
          Database error:{" "}
          {ownersError?.message ||
            resultsError?.message ||
            teamsError?.message}
        </p>
      </main>
    );
  }

  // =========================
  // BUILD CAREER STATS
  // =========================

  const ownerStats = (owners || []).map(
    (owner) => {
      const results = (seasonResults || []).filter(
        (result) =>
          result.owner_id === owner.id
      );

      const currentTeam = (
        currentTeams || []
      ).find(
        (team) => team.owner_id === owner.id
      );

      const wins = results.reduce(
        (total, result) =>
          total + Number(result.wins || 0),
        0
      );

      const losses = results.reduce(
        (total, result) =>
          total + Number(result.losses || 0),
        0
      );

      const ties = results.reduce(
        (total, result) =>
          total + Number(result.ties || 0),
        0
      );

      const pointsFor = results.reduce(
        (total, result) =>
          total +
          Number(result.points_for || 0),
        0
      );

      const pointsAgainst = results.reduce(
        (total, result) =>
          total +
          Number(
            result.points_against || 0
          ),
        0
      );

      const playoffAppearances =
        results.filter(
          (result) =>
            result.playoff_appearance === true
        ).length;

      const finalsAppearances =
        results.filter(
          (result) =>
            result.championship_appearance ===
            true
        ).length;

      const championships =
        results.filter(
          (result) =>
            result.champion === true
        ).length;

      const gamesPlayed =
        wins + losses + ties;

      const winPercentage =
        gamesPlayed > 0
          ? ((wins + ties * 0.5) /
              gamesPlayed) *
            100
          : 0;

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
        wins,
        losses,
        ties,
        pointsFor,
        pointsAgainst,
        playoffAppearances,
        finalsAppearances,
        championships,
        gamesPlayed,
        winPercentage,
        seasonsPlayed,
        firstSeason,
        latestSeason,
      };
    }
  );

  // =========================
  // SORT OWNERS
  // Active owners first.
  // Then championships.
  // Then career wins.
  // =========================

  ownerStats.sort((a, b) => {
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

    return b.wins - a.wins;
  });

  const activeOwners = ownerStats.filter(
    (owner) => owner.active
  );

  const formerOwners = ownerStats.filter(
    (owner) => !owner.active
  );

  // =========================
  // OWNER CARD
  // =========================

  function OwnerCard({ owner }) {
    return (
      <a
        className="owner-card"
        href={`/owners/${owner.id}`}
      >
        <div className="owner-card-top">
          <div>
            <span className="owner-status">
              {owner.active
                ? "ACTIVE OWNER"
                : "FORMER OWNER"}
            </span>

            <h3>{owner.name}</h3>

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

        <div className="owner-record">
          <div>
            <strong>
              {owner.wins}-
              {owner.losses}
              {owner.ties > 0
                ? `-${owner.ties}`
                : ""}
            </strong>

            <span>
              CAREER RECORD
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
              WIN %
            </span>
          </div>
        </div>

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

  // =========================
  // PAGE
  // =========================

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

      {/* PAGE HERO */}

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            THE LEAGUE
          </p>

          <h1>Owners</h1>

          <p>
            The complete history of everyone
            who has competed in Dirty P Fantasy
            Football.
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

      {/* BACK HOME */}

      <div className="page-nav">
        <a href="/">
          ← Home
        </a>

        <span>
          Career records through{" "}
          {currentSeason}
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
          {activeOwners.map((owner) => (
            <OwnerCard
              key={owner.id}
              owner={owner}
            />
          ))}
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
            {formerOwners.map((owner) => (
              <OwnerCard
                key={owner.id}
                owner={owner}
              />
            ))}
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
