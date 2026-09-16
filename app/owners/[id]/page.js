import { supabase } from "../../../lib/supabase";

export default async function OwnerProfile({ params }) {
  const { id } = await params;
  const ownerId = Number(id);

  // =========================
  // OWNER
  // =========================

  const { data: owner, error: ownerError } =
    await supabase
      .from("owners")
      .select(`
        id,
        name,
        current_team_name,
        active
      `)
      .eq("id", ownerId)
      .single();

  if (ownerError || !owner) {
    return (
      <main className="page-shell">
        <h1>Owner Not Found</h1>
        <a href="/owners">← Back to Owners</a>
      </main>
    );
  }

  // =========================
  // ALL OWNERS
  // =========================

  const { data: allOwners } =
    await supabase
      .from("owners")
      .select(`
        id,
        name
      `);

  // =========================
  // OWNER SEASON RESULTS
  // =========================

  const { data: seasonResults } =
    await supabase
      .from("season_results")
      .select(`
        season_year,
        wins,
        losses,
        ties,
        points_for,
        points_against,
        regular_season_finish,
        final_finish,
        playoff_appearance,
        championship_appearance,
        champion
      `)
      .eq("owner_id", ownerId)
      .order("season_year", {
        ascending: false,
      });

  // =========================
  // OWNER TEAM HISTORY
  // =========================

  const { data: teamHistory } =
    await supabase
      .from("teams")
      .select(`
        season_year,
        team_name
      `)
      .eq("owner_id", ownerId)
      .order("season_year", {
        ascending: false,
      });

  // =========================
  // ALL-FRANCHISE TEAM
  // =========================

  const { data: allFranchiseTeam } =
    await supabase
      .from("all_franchise_teams")
      .select(`
        owner_id,
        franchise_slot,
        espn_player_id,
        player_name,
        position,
        season_year,
        dirty_p_team_name,
        fantasy_points
      `)
      .eq("owner_id", ownerId);

  // =========================
  // ALL MATCHUPS
  // =========================

  const { data: allMatchups } =
    await supabase
      .from("matchups")
      .select(`
        id,
        season_year,
        matchup_period,
        matchup_type,
        playoff_tier,
        home_owner_id,
        away_owner_id,
        home_team_name,
        away_team_name,
        home_score,
        away_score,
        winner,
        is_playoff,
        is_championship,
        is_third_place
      `)
      .or(
        `home_owner_id.eq.${ownerId},away_owner_id.eq.${ownerId}`
      )
      .order("season_year", {
        ascending: false,
      })
      .order("matchup_period", {
        ascending: false,
      });

  const results = seasonResults || [];
  const teams = teamHistory || [];
  const matchups = allMatchups || [];
  const owners = allOwners || [];

  // =========================
  // ALL-FRANCHISE TEAM ORDER
  // =========================

  const franchiseSlotOrder = {
    QB: 1,
    RB1: 2,
    RB2: 3,
    WR1: 4,
    WR2: 5,
    TE: 6,
    FLEX: 7,
    K: 8,
    "D/ST": 9,
  };

  const franchiseTeam = [
    ...(allFranchiseTeam || []),
  ].sort(
    (a, b) =>
      (franchiseSlotOrder[
        a.franchise_slot
      ] || 99) -
      (franchiseSlotOrder[
        b.franchise_slot
      ] || 99)
  );

  // =========================
  // HELPERS
  // =========================

  function getOwnerName(id) {
    return (
      owners.find(
        (otherOwner) =>
          otherOwner.id === id
      )?.name || "Unknown"
    );
  }

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

  function normalizeTeamName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[’‘]/g, "'")
      .toLowerCase();
  }

  function getGameType(matchup) {
    const matchupType = String(
      matchup.matchup_type || ""
    )
      .trim()
      .toLowerCase();

    const playoffTier = String(
      matchup.playoff_tier || ""
    )
      .trim()
      .toLowerCase();

    // Consolation MUST be checked first
    // because ESPN also marks these
    // games as is_playoff = true.

    if (
      matchupType === "consolation" ||
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
      )
    ) {
      return "Consolation";
    }

    if (
      matchupType === "playoff" ||
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
      matchup.is_playoff === true
    ) {
      return "Playoff";
    }

    return "Regular Season";
  }

  function getGameDetails(matchup) {
    const ownerIsHome =
      matchup.home_owner_id === ownerId;

    const ownerIsAway =
      matchup.away_owner_id === ownerId;

    if (!ownerIsHome && !ownerIsAway) {
      return null;
    }

    const opponentId = ownerIsHome
      ? matchup.away_owner_id
      : matchup.home_owner_id;

    const ownerScore = Number(
      ownerIsHome
        ? matchup.home_score
        : matchup.away_score
    );

    const opponentScore = Number(
      ownerIsHome
        ? matchup.away_score
        : matchup.home_score
    );

    const officialWinner = String(
      matchup.winner || ""
    ).toUpperCase();

    let result = "T";

    if (officialWinner === "HOME") {
      result = ownerIsHome
        ? "W"
        : "L";
    } else if (
      officialWinner === "AWAY"
    ) {
      result = ownerIsAway
        ? "W"
        : "L";
    } else if (
      officialWinner === "TIE"
    ) {
      result = "T";
    } else if (
      ownerScore > opponentScore
    ) {
      result = "W";
    } else if (
      ownerScore < opponentScore
    ) {
      result = "L";
    }

    return {
      opponentId,
      opponentName:
        getOwnerName(opponentId),
      ownerScore,
      opponentScore,
      result,
      margin:
        ownerScore - opponentScore,
      gameType:
        getGameType(matchup),
    };
  }

  // =========================
  // COMPLETED HISTORICAL GAMES
  // =========================

  const completedGames = matchups
    .filter(
      (matchup) =>
        matchup.season_year < 2026
    )
    .map((matchup) => {
      const details =
        getGameDetails(matchup);

      if (!details) {
        return null;
      }

      return {
        ...matchup,
        ...details,
      };
    })
    .filter(Boolean);

  // =========================
  // TEAM NAME HISTORY
  // =========================

  const teamNameMap = new Map();

  teams.forEach((team) => {
    const normalizedName =
      normalizeTeamName(
        team.team_name
      );

    if (!normalizedName) {
      return;
    }

    if (
      !teamNameMap.has(
        normalizedName
      )
    ) {
      teamNameMap.set(
        normalizedName,
        {
          team_name:
            team.team_name,
          seasons: new Set(),
        }
      );
    }

    teamNameMap
      .get(normalizedName)
      .seasons.add(
        team.season_year
      );
  });

  const teamNameGroups = Array.from(
    teamNameMap.values()
  ).map((team) => ({
    team_name: team.team_name,
    seasons: Array.from(
      team.seasons
    ),
  }));

  // =========================
  // SEASON HISTORY
  // =========================

  const seasonHistory = results.map(
    (season) => {
      const team = teams.find(
        (team) =>
          team.season_year ===
          season.season_year
      );

      let postseason =
        "Missed Playoffs";

      if (season.champion) {
        postseason = "Champion";
      } else if (
        season.championship_appearance
      ) {
        postseason = "Runner-Up";
      } else if (
        season.playoff_appearance
      ) {
        postseason = "Playoffs";
      }

      return {
        ...season,
        teamName:
          team?.team_name || "—",
        postseason,
      };
    }
  );

  // =========================
  // HEAD TO HEAD
  // =========================

  const headToHeadMap = {};

  completedGames.forEach((game) => {
    if (!game.opponentId) {
      return;
    }

    if (
      !headToHeadMap[
        game.opponentId
      ]
    ) {
      headToHeadMap[
        game.opponentId
      ] = {
        opponentId:
          game.opponentId,
        opponentName:
          game.opponentName,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
      };
    }

    const record =
      headToHeadMap[
        game.opponentId
      ];

    record.games += 1;

    if (game.result === "W") {
      record.wins += 1;
    }

    if (game.result === "L") {
      record.losses += 1;
    }

    if (game.result === "T") {
      record.ties += 1;
    }
  });

  const headToHead = Object.values(
    headToHeadMap
  ).sort((a, b) =>
    a.opponentName.localeCompare(
      b.opponentName
    )
  );

  // =========================
  // CAREER HIGHS & LOWS
  // =========================

  const gamesWithScores =
    completedGames.filter(
      (game) =>
        Number.isFinite(
          game.ownerScore
        ) &&
        Number.isFinite(
          game.opponentScore
        )
    );

  const wins =
    gamesWithScores.filter(
      (game) =>
        game.result === "W"
    );

  const losses =
    gamesWithScores.filter(
      (game) =>
        game.result === "L"
    );

  const highestScore =
    gamesWithScores.length > 0
      ? [...gamesWithScores].sort(
          (a, b) =>
            b.ownerScore -
            a.ownerScore
        )[0]
      : null;

  const lowestScore =
    gamesWithScores.length > 0
      ? [...gamesWithScores].sort(
          (a, b) =>
            a.ownerScore -
            b.ownerScore
        )[0]
      : null;

  const biggestWin =
    wins.length > 0
      ? [...wins].sort(
          (a, b) =>
            b.margin -
            a.margin
        )[0]
      : null;

  const biggestLoss =
    losses.length > 0
      ? [...losses].sort(
          (a, b) =>
            a.margin -
            b.margin
        )[0]
      : null;

  const closestWin =
    wins.length > 0
      ? [...wins].sort(
          (a, b) =>
            a.margin -
            b.margin
        )[0]
      : null;

  const closestLoss =
    losses.length > 0
      ? [...losses].sort(
          (a, b) =>
            b.margin -
            a.margin
        )[0]
      : null;

  // =========================
  // BEST REGULAR SEASON
  // =========================

  const bestSeason =
    results.length > 0
      ? [...results].sort(
          (a, b) => {
            const aGames =
              Number(
                a.wins || 0
              ) +
              Number(
                a.losses || 0
              ) +
              Number(
                a.ties || 0
              );

            const bGames =
              Number(
                b.wins || 0
              ) +
              Number(
                b.losses || 0
              ) +
              Number(
                b.ties || 0
              );

            const aPct =
              aGames > 0
                ? (
                    Number(
                      a.wins || 0
                    ) +
                    Number(
                      a.ties || 0
                    ) * 0.5
                  ) / aGames
                : 0;

            const bPct =
              bGames > 0
                ? (
                    Number(
                      b.wins || 0
                    ) +
                    Number(
                      b.ties || 0
                    ) * 0.5
                  ) / bGames
                : 0;

            if (bPct !== aPct) {
              return bPct - aPct;
            }

            return (
              Number(
                b.points_for || 0
              ) -
              Number(
                a.points_for || 0
              )
            );
          }
        )[0]
      : null;

  // =========================
  // LONGEST WIN STREAK
  // =========================

  const chronologicalGames = [
    ...completedGames,
  ].sort((a, b) => {
    if (
      a.season_year !==
      b.season_year
    ) {
      return (
        a.season_year -
        b.season_year
      );
    }

    return (
      a.matchup_period -
      b.matchup_period
    );
  });

  let longestWinStreak = 0;
  let currentWinStreak = 0;

  chronologicalGames.forEach(
    (game) => {
      if (game.result === "W") {
        currentWinStreak += 1;

        longestWinStreak =
          Math.max(
            longestWinStreak,
            currentWinStreak
          );
      } else {
        currentWinStreak = 0;
      }
    }
  );

  // =========================
  // GAME DISPLAY
  // =========================

  function GameDescription({
    game,
  }) {
    if (!game) {
      return <span>—</span>;
    }

    return (
      <>
        <strong>
          {game.ownerScore.toFixed(
            2
          )}
        </strong>

        <span>
          vs {game.opponentName}
        </span>

        <small>
          {game.season_year} · Week{" "}
          {game.matchup_period}
        </small>
      </>
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

      {/* OWNER HERO */}

      <section className="owner-profile-hero">
        <div>
          <p className="eyebrow">
            OWNER PROFILE
          </p>

          <h1>
            {owner.name}
          </h1>

          <p>
            {owner.active
              ? owner.current_team_name ||
                "Active Owner"
              : "Former Dirty P Owner"}
          </p>
        </div>
      </section>

      {/* NAV */}

      <div className="page-nav">
        <a href="/owners">
          ← All Owners
        </a>

        <a href="/">
          Home
        </a>
      </div>

      {/* SEASON HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              YEAR BY YEAR
            </p>

            <h2>
              Season History
            </h2>
          </div>

          <span>
            {seasonHistory.length} Seasons
          </span>
        </div>

        <div className="profile-table-wrap">
          <table className="profile-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Team</th>
                <th>Record</th>
                <th>PF</th>
                <th>PA</th>
                <th>
                  Reg. Finish
                </th>
                <th>
                  Final Finish
                </th>
                <th>
                  Postseason
                </th>
              </tr>
            </thead>

            <tbody>
              {seasonHistory.map(
                (season) => (
                  <tr
                    key={
                      season.season_year
                    }
                  >
                    <td>
                      <strong>
                        {
                          season.season_year
                        }
                      </strong>
                    </td>

                    <td>
                      {season.teamName}
                    </td>

                    <td>
                      {formatRecord(
                        season.wins,
                        season.losses,
                        season.ties
                      )}
                    </td>

                    <td>
                      {Number(
                        season.points_for ||
                          0
                      ).toFixed(2)}
                    </td>

                    <td>
                      {Number(
                        season.points_against ||
                          0
                      ).toFixed(2)}
                    </td>

                    <td>
                      {
                        season.regular_season_finish ||
                        "—"
                      }
                    </td>

                    <td>
                      {
                        season.final_finish ||
                        "—"
                      }
                    </td>

                    <td>
                      <span
                        className={
                          season.champion
                            ? "profile-champion-label"
                            : ""
                        }
                      >
                        {
                          season.postseason
                        }
                      </span>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ALL-FRANCHISE TEAM */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              FRANCHISE GREATS
            </p>

            <h2>
              All-Franchise Team
            </h2>
          </div>

          <span>
            Best Single-Season Players
          </span>
        </div>

        {franchiseTeam.length > 0 ? (
          <div className="all-franchise-grid">
            {franchiseTeam.map(
              (player) => (
                <div
                  className="all-franchise-card"
                  key={`${player.franchise_slot}-${player.espn_player_id}-${player.season_year}`}
                >
                  <div className="all-franchise-slot">
                    {
                      player.franchise_slot
                    }
                  </div>

                  <div className="all-franchise-player">
                    {
                      player.player_name
                    }
                  </div>

                  <div className="all-franchise-meta">
                    <span>
                      {player.position}
                    </span>

                    <span>
                      {
                        player.season_year
                      }
                    </span>
                  </div>

                  <div className="all-franchise-team-name">
                    {
                      player.dirty_p_team_name ||
                      "—"
                    }
                  </div>

                  <div className="all-franchise-points">
                    {Number(
                      player.fantasy_points ||
                        0
                    ).toFixed(2)}{" "}
                    <small>
                      PTS
                    </small>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="current-panel">
            <div className="empty-current-state">
              <strong>
                No All-Franchise Team data yet.
              </strong>

              <p>
                Player history has not been
                loaded for this owner.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* HEAD TO HEAD */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              RIVALRIES
            </p>

            <h2>
              Head-to-Head
            </h2>
          </div>
        </div>

        <div className="h2h-grid">
          {headToHead.map(
            (record) => (
              <div
                className="h2h-card"
                key={
                  record.opponentId
                }
              >
                <span>
                  vs.
                </span>

                <strong>
                  {
                    record.opponentName
                  }
                </strong>

                <div>
                  {formatRecord(
                    record.wins,
                    record.losses,
                    record.ties
                  )}
                </div>

                <small>
                  {record.games} Games
                </small>
              </div>
            )
          )}
        </div>
      </section>

      {/* CAREER HIGHS & LOWS */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              CAREER RECORD BOOK
            </p>

            <h2>
              Highs & Lows
            </h2>
          </div>
        </div>

        <div className="career-record-grid">

          <div className="career-record-card">
            <span>
              HIGHEST SCORE
            </span>

            <GameDescription
              game={highestScore}
            />
          </div>

          <div className="career-record-card">
            <span>
              LOWEST SCORE
            </span>

            <GameDescription
              game={lowestScore}
            />
          </div>

          <div className="career-record-card">
            <span>
              BIGGEST WIN
            </span>

            <GameDescription
              game={biggestWin}
            />
          </div>

          <div className="career-record-card">
            <span>
              BIGGEST LOSS
            </span>

            <GameDescription
              game={biggestLoss}
            />
          </div>

          <div className="career-record-card">
            <span>
              CLOSEST WIN
            </span>

            <GameDescription
              game={closestWin}
            />
          </div>

          <div className="career-record-card">
            <span>
              CLOSEST LOSS
            </span>

            <GameDescription
              game={closestLoss}
            />
          </div>

          <div className="career-record-card">
            <span>
              BEST REGULAR SEASON
            </span>

            {bestSeason ? (
              <>
                <strong>
                  {formatRecord(
                    bestSeason.wins,
                    bestSeason.losses,
                    bestSeason.ties
                  )}
                </strong>

                <span>
                  {
                    bestSeason.season_year
                  }
                </span>
              </>
            ) : (
              <strong>
                —
              </strong>
            )}
          </div>

          <div className="career-record-card">
            <span>
              LONGEST WIN STREAK
            </span>

            <strong>
              {longestWinStreak}
            </strong>

            <span>
              Consecutive Games
            </span>
          </div>

        </div>
      </section>

      {/* TEAM NAME HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              THE FRANCHISE
            </p>

            <h2>
              Team Name History
            </h2>
          </div>
        </div>

        <div className="team-history-list">
          {teamNameGroups.map(
            (team) => (
              <div
                className="team-history-row"
                key={
                  normalizeTeamName(
                    team.team_name
                  )
                }
              >
                <strong>
                  {team.team_name}
                </strong>

                <span>
                  {team.seasons
                    .sort(
                      (a, b) =>
                        a - b
                    )
                    .join(", ")}
                </span>
              </div>
            )
          )}
        </div>
      </section>

      {/* COMPLETE MATCHUP HISTORY */}

      <section className="owner-profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              EVERY GAME
            </p>

            <h2>
              Matchup History
            </h2>
          </div>

          <span>
            {completedGames.length} Games
          </span>
        </div>

        <div className="profile-table-wrap">
          <table className="profile-table matchup-history-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Week</th>
                <th>Type</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Score</th>
              </tr>
            </thead>

            <tbody>
              {completedGames.map(
                (game) => (
                  <tr key={game.id}>
                    <td>
                      {
                        game.season_year
                      }
                    </td>

                    <td>
                      {
                        game.matchup_period
                      }
                    </td>

                    <td>
                      {
                        game.gameType
                      }
                    </td>

                    <td>
                      {
                        game.opponentName
                      }
                    </td>

                    <td>
                      <strong
                        className={
                          game.result ===
                          "W"
                            ? "game-win"
                            : game.result ===
                              "L"
                            ? "game-loss"
                            : ""
                        }
                      >
                        {game.result}
                      </strong>
                    </td>

                    <td>
                      {game.ownerScore.toFixed(
                        2
                      )}
                      {" – "}
                      {game.opponentScore.toFixed(
                        2
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
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

    </main>
  );
}
