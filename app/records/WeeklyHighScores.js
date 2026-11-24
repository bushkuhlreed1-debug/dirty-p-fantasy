import Link from "next/link";
import { formatHighScoreMoney, HIGH_SCORE_FIRST_SEASON, HIGH_SCORE_PRIZE } from "../../lib/weeklyHighScores";

export default function WeeklyHighScores({ data, ownerNames }) {
  const ranked = [...data.totals].sort(([idA, a], [idB, b]) =>
    b.wins - a.wins || (ownerNames.get(idA) ?? "").localeCompare(ownerNames.get(idB) ?? "")
  );
  const seasons = new Map();
  for (const award of data.awards) {
    if (!seasons.has(award.year)) seasons.set(award.year, []);
    seasons.get(award.year).push(award);
  }

  return (
    <section className="owners-section" id="weekly-high-scores" aria-labelledby="weekly-high-scores-title">
      <div className="section-heading">
        <h2 id="weekly-high-scores-title">Weekly High-Score Awards</h2>
      </div>
      <p className="dp-all-stars-note">
        {formatHighScoreMoney(HIGH_SCORE_PRIZE)} to the highest-scoring owner each regular-season week since {HIGH_SCORE_FIRST_SEASON}.
      </p>

      {ranked.length ? (
        <table className="dp-all-stars-table" aria-label="Weekly high-score award totals">
          <thead>
            <tr><th scope="col">Owner</th><th scope="col">Wins</th><th scope="col">Prize money</th></tr>
          </thead>
          <tbody>
            {ranked.map(([id, { wins, earnings }]) => (
              <tr key={id}>
                <th scope="row"><Link href={`/owners/${id}`}>{ownerNames.get(id) ?? "Unknown owner"}</Link></th>
                <td>{wins}</td>
                <td>{formatHighScoreMoney(earnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No weekly prizes have been awarded yet.</p>}

      <h3>Weekly Winners</h3>
      <div className="dp-all-stars-seasons">
        {[...seasons].map(([year, weeks]) => (
          <details key={year} className="dp-home-category">
            <summary className="dp-home-category-toggle">{year} Weekly Winners</summary>
            <table className="dp-all-stars-table" aria-label={`${year} weekly high-score winners`}>
              <thead>
                <tr><th scope="col">Week</th><th scope="col">Owner</th><th scope="col">Points</th><th scope="col">Prize</th></tr>
              </thead>
              <tbody>
                {weeks.map(({ week, points, winnerIds, payout }) => (
                  <tr key={week}>
                    <th scope="row">{week}</th>
                    <td>{winnerIds.map(id => ownerNames.get(id) ?? "Unknown owner").join(" & ")}</td>
                    <td>{points.toFixed(2)}</td>
                    <td>{payout == null ? "Tie pending" : formatHighScoreMoney(payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>
    </section>
  );
}
