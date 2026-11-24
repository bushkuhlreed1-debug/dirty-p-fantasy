import Link from "next/link";
import { formatHighScoreMoney, HIGH_SCORE_FIRST_SEASON, HIGH_SCORE_PRIZE } from "../../lib/weeklyHighScores";

export default function WeeklyHighScores({ data, ownerNames }) {
  const ranked = [...data.totals].sort(([idA, a], [idB, b]) =>
    b.wins - a.wins || (ownerNames.get(idA) ?? "").localeCompare(ownerNames.get(idB) ?? "")
  );

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
    </section>
  );
}
