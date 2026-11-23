import Link from "next/link";

function SelectionRecord({ count, owners, ownerNames }) {
  return (
    <article className="owner-card dp-record-card dp-all-stars-record">
      <h3 className="owner-status">MOST ALL-STAR SELECTIONS</h3>
      <p className="dp-record-value">{count} {count === 1 ? "selection" : "selections"}</p>
      <div className="dp-record-owner">
        {owners.map(([id], index) => (
          <span key={id}>
            {index > 0 ? " · " : ""}
            <Link href={`/owners/${id}`}>{ownerNames.get(Number(id)) ?? "Unknown owner"}</Link>
          </span>
        ))}
      </div>
      <p className="dp-record-secondary">Counts every All-Star spot earned by players on the owner’s Dirty P teams.</p>
    </article>
  );
}

export default function SeasonAllStars({ data, ownerNames }) {
  const { seasons = [], selectionCounts = {} } = data ?? {};
  const counts = Object.entries(selectionCounts);
  const mostSelections = Math.max(0, ...Object.values(selectionCounts));
  const leaders = counts.filter(([, count]) => count === mostSelections);

  return (
    <section className="owners-section" id="season-all-stars" aria-labelledby="season-all-stars-title">
      <div className="section-heading">
        <h2 id="season-all-stars-title">Seasonal All-Star Teams</h2>
      </div>
      {seasons?.length ? (
        <>
          {leaders.length > 0 && (
            <SelectionRecord count={mostSelections} owners={leaders} ownerNames={ownerNames} />
          )}
          <p className="dp-all-stars-note">
            Selected by archived season fantasy points. FLEX goes to the highest-scoring remaining RB, WR, or TE.
          </p>
          <div className="dp-all-stars-seasons">
            {seasons.map(({ year, lineup }, index) => (
              <details className="dp-home-category" key={year} open={index === 0}>
                <summary className="dp-home-category-toggle">{year} All-Stars</summary>
                <table className="dp-all-stars-table" aria-label={`${year} Dirty P All-Star Team`}>
                  <thead>
                    <tr><th scope="col">Slot</th><th scope="col">Player / Dirty P team</th><th scope="col">Fantasy pts</th></tr>
                  </thead>
                  <tbody>
                    {lineup.map(({ slot, player }) => (
                      <tr key={slot}>
                        <th scope="row">{slot}</th>
                        <td>
                          {player ? (
                            <>
                              <strong>{player.player_name}</strong>
                              <small>{player.dirty_p_team_name?.trim() || "Team unavailable"}</small>
                            </>
                          ) : "—"}
                        </td>
                        <td>{player ? Number(player.started_points).toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </>
      ) : (
        <p className="dp-all-stars-note">Seasonal All-Star lineups are unavailable.</p>
      )}
    </section>
  );
}
