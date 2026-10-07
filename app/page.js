{/* AROUND THE LEAGUE */}
{!showLiveScoreboard && (
  <section className="section-block">
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          WEEK {latestCompletedWeek || currentWeek}
        </p>

        <h2>Around the League</h2>
      </div>

      <span>
        Stories & Takeaways
      </span>
    </div>

    {aroundLeague.length > 0 ? (
      <div className="around-league">
        {aroundLeague.map(
          (story, index) => (
            <article
              className="around-league-story"
              key={`${story.headline}-${index}`}
            >
              <h3>
                {story.headline}
              </h3>

              <p>
                {story.text}
              </p>
            </article>
          )
        )}
      </div>
    ) : (
      <div className="current-panel">
        <div className="empty-current-state">
          <strong>
            Weekly league coverage will appear after completed games.
          </strong>
        </div>
      </div>
    )}
  </section>
)}
