import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  return num(value).toFixed(2);
}

function getGameType(game) {
  const matchupType = String(game.matchup_type || "")
    .trim()
    .toLowerCase();

  const playoffTier = String(game.playoff_tier || "")
    .trim()
    .toLowerCase();

  if (
    matchupType === "consolation" ||
    matchupType.includes("consolation") ||
    playoffTier.includes("consolation") ||
    playoffTier.includes("losers") ||
    playoffTier.includes("loser")
  ) {
    return "consolation";
  }

  if (
    matchupType === "playoff" ||
    matchupType.includes("championship") ||
    playoffTier.includes("winners_bracket") ||
    playoffTier.includes("winner") ||
    playoffTier.includes("championship") ||
    game.is_championship === true
  ) {
    return "playoff";
  }

  return "regular";
}

function getResult(game, side) {
  const winner = String(game.winner || "").toUpperCase();

  if (winner === "TIE") return "T";
  if (winner === side) return "W";

  if (winner === "HOME" || winner === "AWAY") {
    return "L";
  }

  const home = num(game.home_score);
  const away = num(game.away_score);

  if (home === away) return "T";

  if (side === "HOME") {
    return home > away ? "W" : "L";
  }

  return away > home ? "W" : "L";
}

function pairKey(ownerA, ownerB) {
  return [Number(ownerA), Number(ownerB)]
    .sort((a, b) => a - b)
    .join("-");
}

export default async function HeadToHeadPage() {
  const [{ data: owners }, { data: matchupData }] =
    await Promise.all([
      supabase
        .from("owners")
        .select("id, name")
        .order("name", { ascending: true }),

      supabase
        .from("matchups")
        .select("*")
        .lt("season_year", 2026)
        .order("season_year", { ascending: true })
        .order("matchup_period", { ascending: true }),
    ]);

  const ownerMap = new Map(
    (owners || []).map((owner) => [
      Number(owner.id),
      owner.name,
    ])
  );

  const completedGames = (matchupData || []).filter((game) => {
    const home = Number(game.home_score);
    const away = Number(game.away_score);

    return (
      game.home_owner_id &&
      game.away_owner_id &&
      game.home_score !== null &&
      game.away_score !== null &&
      Number.isFinite(home) &&
      Number.isFinite(away) &&
      !(home === 0 && away === 0)
    );
  });

  /*
   * Main H2H record:
   * Regular season + championship-bracket playoffs.
   * Consolation games are tracked separately.
   */
  const pairings = new Map();

  for (const game of completedGames) {
    const homeId = Number(game.home_owner_id);
    const awayId = Number(game.away_owner_id);

    if (!homeId || !awayId || homeId === awayId) continue;

    const key = pairKey(homeId, awayId);
    const ids = [homeId, awayId].sort((a, b) => a - b);

    if (!pairings.has(key)) {
      pairings.set(key, {
        owner1Id: ids[0],
        owner2Id: ids[1],

        owner1Wins: 0,
        owner2Wins: 0,
        ties: 0,

        owner1Points: 0,
        owner2Points: 0,

        meetings: 0,
        regularMeetings: 0,
        playoffMeetings: 0,
        consolationMeetings: 0,
        championshipMeetings: 0,

        games: [],
      });
    }

    const pairing = pairings.get(key);
    const type = getGameType(game);

    const owner1IsHome =
      pairing.owner1Id === homeId;

    const owner1Score = owner1IsHome
      ? num(game.home_score)
      : num(game.away_score);

    const owner2Score = owner1IsHome
      ? num(game.away_score)
      : num(game.home_score);

    const owner1Side = owner1IsHome
      ? "HOME"
      : "AWAY";

    const owner2Side = owner1IsHome
      ? "AWAY"
      : "HOME";

    const owner1Result = getResult(
      game,
      owner1Side
    );

    const owner2Result = getResult(
      game,
      owner2Side
    );

    if (type === "regular") {
      pairing.regularMeetings += 1;
    }

    if (type === "playoff") {
      pairing.playoffMeetings += 1;
    }

    if (type === "consolation") {
      pairing.consolationMeetings += 1;
    }

    if (game.is_championship === true) {
      pairing.championshipMeetings += 1;
    }

    /*
     * Consolation games are preserved in history,
     * but not included in the main series record.
     */
    if (type !== "consolation") {
      pairing.meetings += 1;

      pairing.owner1Points += owner1Score;
      pairing.owner2Points += owner2Score;

      if (owner1Result === "W") {
        pairing.owner1Wins += 1;
      } else if (owner2Result === "W") {
        pairing.owner2Wins += 1;
      } else {
        pairing.ties += 1;
      }
    }

    pairing.games.push({
      season: Number(game.season_year),
      week: Number(game.matchup_period),
      type,
      isChampionship:
        game.is_championship === true,

      owner1Score,
      owner2Score,

      owner1Team: owner1IsHome
        ? game.home_team_name
        : game.away_team_name,

      owner2Team: owner1IsHome
        ? game.away_team_name
        : game.home_team_name,

      owner1Result,
      owner2Result,
    });
  }

  const pairingRows = [...pairings.values()]
    .filter((pairing) => pairing.meetings > 0)
    .map((pairing) => ({
      ...pairing,

      owner1Name:
        ownerMap.get(pairing.owner1Id) ||
        "Unknown Owner",

      owner2Name:
        ownerMap.get(pairing.owner2Id) ||
        "Unknown Owner",

      owner1Average:
        pairing.meetings > 0
          ? pairing.owner1Points /
            pairing.meetings
          : 0,

      owner2Average:
        pairing.meetings > 0
          ? pairing.owner2Points /
            pairing.meetings
          : 0,
    }))
    .sort((a, b) => {
      if (b.meetings !== a.meetings) {
        return b.meetings - a.meetings;
      }

      return a.owner1Name.localeCompare(
        b.owner1Name
      );
    });

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <strong>
            DIRTY P FANTASY FOOTBALL
          </strong>

          <span>LEAGUE ARCHIVE</span>
        </div>
      </header>

      <section className="owners-hero">
        <div>
          <p className="eyebrow">
            ALL-TIME SERIES
          </p>

          <h1>Head-to-Head</h1>

          <p>
            Every Dirty P rivalry in one place.
            Compare all-time records, scoring and
            postseason meetings between league
            owners.
          </p>
        </div>

        <div className="owners-count">
          <strong>{pairingRows.length}</strong>
          <span>RIVALRIES</span>
        </div>
      </section>

      <nav className="page-nav">
        <Link href="/">← Home</Link>
        <span>2014–2025</span>
      </nav>

      <section className="owners-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              SERIES HISTORY
            </p>

            <h2>All Head-to-Head Records</h2>
          </div>

          <span>
            Regular Season + Championship Bracket
          </span>
        </div>

        <div className="h2h-page-grid">
          {pairingRows.map((pairing) => (
            <div
              className="h2h-series-card"
              key={`${pairing.owner1Id}-${pairing.owner2Id}`}
            >
              <div className="h2h-series-top">
                <span>
                  {pairing.meetings}{" "}
                  {pairing.meetings === 1
                    ? "MEETING"
                    : "MEETINGS"}
                </span>

                {pairing.playoffMeetings > 0 && (
                  <strong>
                    {pairing.playoffMeetings} PLAYOFF
                  </strong>
                )}
              </div>

              <div className="h2h-series-matchup">
                <div className="h2h-series-owner">
                  <Link
                    href={`/owners/${pairing.owner1Id}`}
                  >
                    {pairing.owner1Name}
                  </Link>

                  <strong>
                    {pairing.owner1Wins}
                  </strong>

                  <span>WINS</span>
                </div>

                <div className="h2h-series-vs">
                  <span>SERIES</span>

                  <strong>
                    {pairing.owner1Wins}
                    {" - "}
                    {pairing.owner2Wins}
                    {pairing.ties > 0
                      ? ` - ${pairing.ties}`
                      : ""}
                  </strong>

                  <small>
                    {pairing.ties > 0
                      ? `${pairing.ties} tie${
                          pairing.ties === 1
                            ? ""
                            : "s"
                        }`
                      : "No ties"}
                  </small>
                </div>

                <div className="h2h-series-owner right">
                  <Link
                    href={`/owners/${pairing.owner2Id}`}
                  >
                    {pairing.owner2Name}
                  </Link>

                  <strong>
                    {pairing.owner2Wins}
                  </strong>

                  <span>WINS</span>
                </div>
              </div>

              <div className="h2h-series-stats">
                <div>
                  <span>
                    {pairing.owner1Name}
                  </span>

                  <strong>
                    {formatScore(
                      pairing.owner1Points
                    )}
                  </strong>

                  <small>TOTAL POINTS</small>
                </div>

                <div>
                  <span>AVERAGE SCORE</span>

                  <strong>
                    {formatScore(
                      pairing.owner1Average
                    )}
                    {" – "}
                    {formatScore(
                      pairing.owner2Average
                    )}
                  </strong>

                  <small>
                    {pairing.regularMeetings} REG •{" "}
                    {pairing.playoffMeetings} PLAYOFF
                  </small>
                </div>

                <div>
                  <span>
                    {pairing.owner2Name}
                  </span>

                  <strong>
                    {formatScore(
                      pairing.owner2Points
                    )}
                  </strong>

                  <small>TOTAL POINTS</small>
                </div>
              </div>

              {pairing.championshipMeetings > 0 && (
                <div className="h2h-championship-note">
                  🏆 Met in the Dirty P Championship{" "}
                  {pairing.championshipMeetings > 1
                    ? `${pairing.championshipMeetings} times`
                    : ""}
                </div>
              )}

              {pairing.consolationMeetings > 0 && (
                <div className="h2h-consolation-note">
                  {pairing.consolationMeetings} additional
                  consolation{" "}
                  {pairing.consolationMeetings === 1
                    ? "meeting"
                    : "meetings"}{" "}
                  not included in the main series
                  record
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <strong>
          DIRTY P FANTASY FOOTBALL
        </strong>

        <p>
          Independent fantasy league archive. Not
          affiliated with or endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
