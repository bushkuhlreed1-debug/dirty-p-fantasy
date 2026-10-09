import Link from "next/link";
import { supabase } from "../../lib/supabase";

export const dynamic = "force-dynamic";

const SEASON = 2026;
const RIVALRY_WEEK = 11;

const RIVALRIES = [
  ["Reed Bushkuhl", "Austin Lloyd"],
  ["Ryan Goodlett", "Matthew Aitkens"],
  ["Tyler Guenther", "Edward Wachtel"],
  ["Brent Fleischer", "Valentin Almendarez"],
  ["Jacob Madden", "Cody Stinnett"],
];

async function getAllHistoricalMatchups() {
  const all = [];
  const batchSize = 500;

  for (let start = 0; ; start += batchSize) {
    const { data, error } = await supabase
      .from("matchups")
      .select(
        "season_year,matchup_period,home_owner_id,away_owner_id,winner"
      )
      .lt("season_year", SEASON)
      .order("season_year", { ascending: true })
      .order("matchup_period", { ascending: true })
      .range(start, start + batchSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    all.push(...(data || []));

    if (!data || data.length < batchSize) {
      break;
    }
  }

  return all;
}

function calculateSeries(games, firstId, secondId) {
  let firstWins = 0;
  let secondWins = 0;
  let ties = 0;

  for (const game of games) {
    const home = Number(game.home_owner_id);
    const away = Number(game.away_owner_id);

    const isMatch =
      (home === firstId && away === secondId) ||
      (home === secondId && away === firstId);

    if (!isMatch) continue;

    const result = String(game.winner || "")
      .trim()
      .toUpperCase();

    if (result === "TIE") {
      ties++;
      continue;
    }

    let winnerId = null;

    if (result === "HOME") {
      winnerId = home;
    }

    if (result === "AWAY") {
      winnerId = away;
    }

    if (winnerId === firstId) firstWins++;
    if (winnerId === secondId) secondWins++;
  }

  return {
    firstWins,
    secondWins,
    ties,
    meetings: firstWins + secondWins + ties,
  };
}

export default async function RivalryWeekPage() {
  const { data: owners, error } = await supabase
    .from("owners")
    .select("id,name");

  if (error) {
    throw new Error(error.message);
  }

  const ownerMap = new Map(
    (owners || []).map((owner) => [
      owner.name.trim().toLowerCase(),
      owner,
    ])
  );

  const games = await getAllHistoricalMatchups();

  const rivalries = RIVALRIES.map(
    ([firstName, secondName], index) => {
      const first = ownerMap.get(firstName.toLowerCase());
      const second = ownerMap.get(secondName.toLowerCase());

      const series =
        first && second
          ? calculateSeries(
              games,
              Number(first.id),
              Number(second.id)
            )
          : null;

      return {
        index,
        firstName,
        secondName,
        first,
        second,
        series,
      };
    }
  );

  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="site-title">
          <Link href="/">
            <strong>DIRTY P FANTASY FOOTBALL</strong>
          </Link>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      <div className="rw-container">
        <div className="rw-heading">
          <div className="rw-eyebrow">
            2026 SEASON · WEEK {RIVALRY_WEEK}
          </div>

          <h1>RIVALRY WEEK</h1>

          <p>
            Five matchups. Ten owners. Years of bragging rights.
          </p>
        </div>

        <div className="rw-matchups">
          {rivalries.map((rivalry) => {
            const {
              index,
              firstName,
              secondName,
              first,
              second,
              series,
            } = rivalry;

            const firstLeading =
              series &&
              series.firstWins > series.secondWins;

            const secondLeading =
              series &&
              series.secondWins > series.firstWins;

            return (
              <section
                className="rw-card"
                key={`${firstName}-${secondName}`}
              >
                <div className="rw-card-header">
                  <span>
                    RIVALRY {String(index + 1).padStart(2, "0")}
                  </span>

                  <span>WEEK 11 · 2026</span>
                </div>

                <div className="rw-versus">
                  <div className="rw-owner">
                    {first ? (
                      <Link href={`/owners/${first.id}`}>
                        {firstName}
                      </Link>
                    ) : (
                      <span>{firstName}</span>
                    )}
                  </div>

                  <span className="rw-vs">VS</span>

                  <div className="rw-owner">
                    {second ? (
                      <Link href={`/owners/${second.id}`}>
                        {secondName}
                      </Link>
                    ) : (
                      <span>{secondName}</span>
                    )}
                  </div>
                </div>

                <div className="rw-series">
                  <div className="rw-series-title">
                    ALL-TIME SERIES RECORD
                  </div>

                  {series ? (
                    <>
                      <div className="rw-record">
                        <div
                          className={
                            firstLeading ? "rw-leading" : ""
                          }
                        >
                          {series.firstWins}
                        </div>

                        <span className="rw-record-dash">–</span>

                        <div
                          className={
                            secondLeading ? "rw-leading" : ""
                          }
                        >
                          {series.secondWins}
                        </div>
                      </div>

                      <div className="rw-series-caption">
                        {series.meetings === 0
                          ? "No previous meetings"
                          : firstLeading
                          ? `${firstName} leads the series`
                          : secondLeading
                          ? `${secondName} leads the series`
                          : "All-time series tied"}

                        {series.ties > 0 &&
                          ` · ${series.ties} tie${
                            series.ties === 1 ? "" : "s"
                          }`}
                      </div>
                    </>
                  ) : (
                    <div className="rw-series-caption">
                      Owner mapping unavailable
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <style>{`
        .rw-container {
          max-width: 920px;
          margin: 0 auto;
          padding: 36px 16px 115px;
        }

        .rw-heading {
          text-align: center;
          margin-bottom: 32px;
        }

        .rw-eyebrow {
          color: #e9bd67;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }

        .rw-heading h1 {
          margin: 0;
          font-size: clamp(30px, 6vw, 48px);
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: -1.5px;
          color: #f4f5f7;
        }

        .rw-heading p {
          margin: 12px 0 0;
          font-size: 14px;
          color: #a4adbb;
        }

        .rw-matchups {
          display: grid;
          gap: 16px;
        }

        .rw-card {
          overflow: hidden;
          background: #171d26;
          border: 1px solid #303947;
          border-radius: 14px;
        }

        .rw-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          border-bottom: 1px solid #303947;
          color: #aeb8c5;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.3px;
        }

        .rw-card-header span:first-child {
          color: #e9bd67;
        }

        .rw-versus {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          padding: 28px 18px;
          text-align: center;
        }

        .rw-owner {
          min-width: 0;
          color: #f4f5f7;
          font-size: clamp(15px, 3vw, 22px);
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: break-word;
        }

        .rw-owner a {
          color: inherit;
          text-decoration: none;
        }

        .rw-owner a:hover {
          color: #e9bd67;
        }

        .rw-vs {
          color: #e9bd67;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .rw-series {
          padding: 19px 18px 23px;
          text-align: center;
          background: #1b232e;
          border-top: 1px solid #303947;
        }

        .rw-series-title {
          color: #aeb8c5;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.4px;
        }

        .rw-record {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 25px;
          margin-top: 9px;
          color: #f4f5f7;
          font-size: 38px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1.3;
        }

        .rw-leading {
          color: #e9bd67;
        }

        .rw-record-dash {
          color: #677585;
          font-size: 25px;
          font-weight: 400;
        }

        .rw-series-caption {
          color: #b7c0cc;
          font-size: 12px;
          margin-top: 8px;
        }

        @media (max-width: 600px) {
          .rw-container {
            padding-top: 27px;
          }

          .rw-card-header {
            padding: 12px 14px;
          }

          .rw-versus {
            grid-template-columns:
              minmax(0, 1fr) 30px minmax(0, 1fr);
            padding: 24px 10px;
            gap: 4px;
          }

          .rw-owner {
            font-size: 15px;
          }

          .rw-record {
            font-size: 34px;
          }
        }
      `}</style>
    </main>
  );
}
