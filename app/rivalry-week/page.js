import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const gold = "#e9bd67";
const border = "#303846";
const panel = "#171d26";

async function getHistoricalMatchups() {
  const all = [];
  const batchSize = 500;

  for (let start = 0; ; start += batchSize) {
    const { data, error } = await supabase
      .from("matchups")
      .select(
        "season_year,home_owner_id,away_owner_id,winner,home_score,away_score"
      )
      .lt("season_year", 2026)
      .order("season_year", { ascending: true })
      .range(start, start + batchSize - 1);

    if (error) throw new Error(error.message);

    const batch = data || [];
    all.push(...batch);

    if (batch.length < batchSize) break;
  }

  return all;
}

function getWinner(game) {
  const winner = String(game.winner || "")
    .trim()
    .toUpperCase();

  if (winner === "HOME") {
    return Number(game.home_owner_id);
  }

  if (winner === "AWAY") {
    return Number(game.away_owner_id);
  }

  if (winner === "TIE") {
    return "tie";
  }

  // Only historical games with recorded winners count.
  return null;
}

function calculateSeries(games, owner1Id, owner2Id) {
  let owner1Wins = 0;
  let owner2Wins = 0;
  let ties = 0;

  for (const game of games) {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    const matches =
      (home === owner1Id && away === owner2Id) ||
      (home === owner2Id && away === owner1Id);

    if (!matches) continue;

    const winner = getWinner(game);

    if (winner === owner1Id) {
      owner1Wins++;
    } else if (winner === owner2Id) {
      owner2Wins++;
    } else if (winner === "tie") {
      ties++;
    }
  }

  return {
    owner1Wins,
    owner2Wins,
    ties,
    meetings: owner1Wins + owner2Wins + ties,
  };
}

export default async function RivalryWeekPage({
  searchParams,
}) {
  const params = await searchParams;

  const { data: owners, error: ownersError } =
    await supabase
      .from("owners")
      .select("id,name")
      .order("name", { ascending: true });

  if (ownersError) {
    throw new Error(ownersError.message);
  }

  const ownerList = owners || [];

  const reed = ownerList.find(
    (owner) => owner.name === "Reed Bushkuhl"
  );

  const austin = ownerList.find(
    (owner) => owner.name === "Austin Lloyd"
  );

  const requestedOwner1 = Number(params?.owner1);
  const requestedOwner2 = Number(params?.owner2);

  const owner1Id =
    requestedOwner1 > 0
      ? requestedOwner1
      : Number(reed?.id || ownerList[0]?.id || 0);

  const owner2Id =
    requestedOwner2 > 0
      ? requestedOwner2
      : Number(austin?.id || ownerList[1]?.id || 0);

  const owner1 = ownerList.find(
    (owner) => Number(owner.id) === owner1Id
  );

  const owner2 = ownerList.find(
    (owner) => Number(owner.id) === owner2Id
  );

  const validSelection =
    owner1 &&
    owner2 &&
    owner1Id !== owner2Id;

  const games = validSelection
    ? await getHistoricalMatchups()
    : [];

  const series = validSelection
    ? calculateSeries(games, owner1Id, owner2Id)
    : {
        owner1Wins: 0,
        owner2Wins: 0,
        ties: 0,
        meetings: 0,
      };

  const leftWinning =
    series.owner1Wins > series.owner2Wins;

  const rightWinning =
    series.owner2Wins > series.owner1Wins;

  const surfaceStyle = {
    background: panel,
    border: `1px solid ${border}`,
    borderRadius: 18,
    boxShadow: "0 12px 38px rgba(0,0,0,0.16)",
  };

  const selectStyle = {
    width: "100%",
    minWidth: 0,
    minHeight: 48,
    padding: "0 14px",
    color: "#f2f4f7",
    background: "#222a35",
    border: `1px solid #3b4552`,
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 600,
  };

  return (
    <main
      className="page-shell"
      style={{
        paddingBottom: 110,
      }}
    >
      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>

          <span>
            THE LEAGUE ARCHIVE · EST. 2014
          </span>
        </div>
      </header>

      <div
        style={{
          maxWidth: 850,
          margin: "0 auto",
          padding: "38px 16px 0",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 29,
          }}
        >
          <div
            style={{
              color: gold,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 2.2,
              marginBottom: 11,
            }}
          >
            DIRTY P FANTASY FOOTBALL
          </div>

          <h1
            style={{
              margin: 0,
              color: "#f7f8fa",
              fontSize: "clamp(29px, 5vw, 42px)",
              fontWeight: 800,
              letterSpacing: "-1px",
            }}
          >
            Rivalry Week
          </h1>

          <p
            style={{
              color: "#98a3b3",
              fontSize: 14,
              marginTop: 11,
            }}
          >
            All-time head-to-head records · 2014–2025
          </p>
        </div>

        {/* OWNER VS OWNER */}

        <form
          method="GET"
          style={{
            ...surfaceStyle,
            padding: "23px 20px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              color: "#d6dce5",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1,
              marginBottom: 20,
            }}
          >
            OWNER VS OWNER
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1fr) 36px minmax(0, 1fr)",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="owner1"
                style={{
                  display: "block",
                  marginBottom: 9,
                  fontSize: 11,
                  fontWeight: 750,
                  color: "#aab5c3",
                  letterSpacing: 0.7,
                }}
              >
                OWNER 1
              </label>

              <select
                id="owner1"
                name="owner1"
                defaultValue={owner1Id}
                style={selectStyle}
                required
              >
                {ownerList.map((owner) => (
                  <option
                    key={owner.id}
                    value={owner.id}
                  >
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                alignSelf: "end",
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: gold,
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              VS
            </div>

            <div style={{ minWidth: 0 }}>
              <label
                htmlFor="owner2"
                style={{
                  display: "block",
                  marginBottom: 9,
                  fontSize: 11,
                  fontWeight: 750,
                  color: "#aab5c3",
                  letterSpacing: 0.7,
                }}
              >
                OWNER 2
              </label>

              <select
                id="owner2"
                name="owner2"
                defaultValue={owner2Id}
                style={selectStyle}
                required
              >
                {ownerList.map((owner) => (
                  <option
                    key={owner.id}
                    value={owner.id}
                  >
                    {owner.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              minHeight: 45,
              marginTop: 20,
              background: gold,
              color: "#151515",
              border: "none",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 850,
              letterSpacing: 0.8,
              cursor: "pointer",
            }}
          >
            VIEW SERIES
          </button>
        </form>

        {/* ALL-TIME SERIES RECORD */}

        {validSelection ? (
          <section
            style={{
              ...surfaceStyle,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "17px 20px",
                borderBottom: `1px solid ${border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span
                style={{
                  color: gold,
                  fontSize: 11,
                  fontWeight: 850,
                  letterSpacing: 1.1,
                }}
              >
                ALL-TIME SERIES
              </span>

              <span
                style={{
                  color: "#a9b4c2",
                  fontSize: 12,
                  fontWeight: 650,
                }}
              >
                {series.meetings}{" "}
                {series.meetings === 1
                  ? "MEETING"
                  : "MEETINGS"}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0,1fr) 40px minmax(0,1fr)",
                alignItems: "center",
                padding: "31px 14px 25px",
                gap: 6,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  textAlign: "center",
                }}
              >
                <Link
                  href={`/owners/${owner1Id}`}
                  style={{
                    color: "#f0f2f6",
                    fontWeight: 750,
                    fontSize:
                      "clamp(12px, 2.6vw, 18px)",
                    textDecoration: "none",
                    overflowWrap: "break-word",
                  }}
                >
                  {owner1.name}
                </Link>

                <div
                  style={{
                    color: leftWinning
                      ? gold
                      : "#f0f2f6",
                    fontWeight: 900,
                    fontSize:
                      "clamp(43px, 9vw, 67px)",
                    letterSpacing: "-2px",
                    lineHeight: 1.15,
                    marginTop: 14,
                  }}
                >
                  {series.owner1Wins}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "#8491a1",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                  }}
                >
                  WINS
                </div>
              </div>

              <div
                style={{
                  color: "#647182",
                  fontSize: 16,
                  fontWeight: 850,
                  textAlign: "center",
                }}
              >
                –
              </div>

              <div
                style={{
                  minWidth: 0,
                  textAlign: "center",
                }}
              >
                <Link
                  href={`/owners/${owner2Id}`}
                  style={{
                    color: "#f0f2f6",
                    fontWeight: 750,
                    fontSize:
                      "clamp(12px, 2.6vw, 18px)",
                    textDecoration: "none",
                    overflowWrap: "break-word",
                  }}
                >
                  {owner2.name}
                </Link>

                <div
                  style={{
                    color: rightWinning
                      ? gold
                      : "#f0f2f6",
                    fontWeight: 900,
                    fontSize:
                      "clamp(43px, 9vw, 67px)",
                    letterSpacing: "-2px",
                    lineHeight: 1.15,
                    marginTop: 14,
                  }}
                >
                  {series.owner2Wins}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "#8491a1",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                  }}
                >
                  WINS
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "15px 18px",
                textAlign: "center",
                borderTop: `1px solid ${border}`,
                color: "#b9c2ce",
                background: "#1b222c",
                fontSize: 13,
                fontWeight: 650,
              }}
            >
              {series.meetings === 0
                ? "No completed matchups found"
                : series.owner1Wins ===
                    series.owner2Wins
                ? "All-time series is tied"
                : `${
                    leftWinning
                      ? owner1.name
                      : owner2.name
                  } leads the all-time series`}

              {series.ties > 0 && (
                <span>
                  {" "}
                  · {series.ties}{" "}
                  {series.ties === 1 ? "tie" : "ties"}
                </span>
              )}
            </div>
          </section>
        ) : (
          <div
            style={{
              ...surfaceStyle,
              padding: 25,
              textAlign: "center",
              color: "#e9bd67",
            }}
          >
            Please select two different owners.
          </div>
        )}
      </div>
    </main>
  );
}
