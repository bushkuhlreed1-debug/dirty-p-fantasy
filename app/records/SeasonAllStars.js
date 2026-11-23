export default function SeasonAllStars({ seasons }) {
  return (
    <section className="owners-section" id="season-all-stars" aria-labelledby="season-all-stars-title">
      <div className="section-heading">
        <h2 id="season-all-stars-title">Seasonal All-Star Teams</h2>
      </div>
      {seasons?.length ? (
        <>
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
