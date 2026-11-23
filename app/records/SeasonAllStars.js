import Link from "next/link";

function SelectionRecord({ label, count, owners, ownerNames, note }) {
  return (
    <article className="owner-card dp-record-card dp-all-stars-record">
      <h3 className="owner-status">{label}</h3>
      <p className="dp-record-value">{count} {count === 1 ? "selection" : "selections"}</p>
      <div className="dp-record-owner">
        {owners.map(([id], index) => (
          <span key={id}>
            {index > 0 ? " · " : ""}
            <Link href={`/owners/${id}`}>{ownerNames.get(id) ?? "Unknown owner"}</Link>
          </span>
        ))}
      </div>
      <p className="dp-record-secondary">{note}</p>
    </article>
  );
}

export default function SeasonAllStars({ data, ownerNames }) {
  const { seasons = [], ownerIds = [] } = data ?? {};
  const counts = new Map(ownerIds.map(id => [id, 0]));
  for (const { lineup } of seasons ?? []) {
    for (const { player } of lineup) {
      const ownerId = Number(player?.owner_id);
      if (ownerId > 0) counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
    }
  }

  const mostSelections = Math.max(0, ...counts.values());
  const leastSelections = Math.min(...counts.values());
  const leaders = [...counts].filter(([, count]) => count === mostSelections);
  const fewest = [...counts].filter(([, count]) => count === leastSelections);

  return (
    <section className="owners-section" id="season-all-stars" aria-labelledby="season-all-stars-title">
      <div className="section-heading">
        <h2 id="season-all-stars-title">Seasonal All-Star Teams</h2>
      </div>
      {seasons?.length ? (
        <>
          {counts.size > 0 && (
            <div className="dp-all-stars-records">
              <SelectionRecord
                label="MOST ALL-STAR SELECTIONS"
                count={mostSelections}
                owners={leaders}
                ownerNames={ownerNames}
                note="Counts every All-Star spot earned by players on the owner’s Dirty P teams."
              />
              <SelectionRecord
                label="LEAST ALL-STAR SELECTIONS"
                count={leastSelections}
                owners={fewest}
                ownerNames={ownerNames}
                note="Includes owners with zero selections when their teams have archived player totals."
              />
            </div>
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
