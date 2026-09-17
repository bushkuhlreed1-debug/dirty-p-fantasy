export default function RivalryWeek() {
  const rivalries = [
    {
      emoji: "✈️",
      name: "AIR & SPACE BOWL",
      matchup: "Jacob Madden vs Cody Stinnett",
      description:
        "Two guys with deep aerospace and defense backgrounds. One matchup built for launch.",
    },
    {
      emoji: "🍺",
      name: "CRAFT BEER CLASSIC",
      matchup: "Ryan Goodlett vs Matthew Aitkens",
      description:
        "A shared love of beer, Charlotte’s strong craft scene, and a Dogfish Head brewer on the other side. Two guys who can appreciate a good pour — and would probably enjoy the other guy’s loss even more.",
    },
    {
      emoji: "⭐",
      name: "THE COWBOYS CLASSIC",
      matchup: "Brent Fleischer vs Valentin Almendarez",
      description:
        "Two die-hard Cowboys fans who spend most Sundays pulling for the same team. Rivalry Week is where the shared loyalty stops.",
    },
    {
      emoji: "🖕",
      name: "THE FUCK YOUR TEAM FEUD",
      matchup: "Tyler Guenther vs Edward “Tres” Wachtel",
      description:
        "A&M vs UT. Patriots vs Cowboys. They can’t agree on who to root for in real football, and Rivalry Week gives them another team to tell each other to go fuck themselves about.",
    },
    {
      emoji: "🎰",
      name: "THE DEGENERATE DUST UP",
      matchup: "Reed Bushkuhl vs Austin Lloyd",
      description:
        "Years of friendship, casino trips, late nights, and bad decisions. Rivalry Week puts something different on the line: bragging rights.",
    },
  ];

  return (
    <main className="page-shell">
      {/* HEADER */}
      <header className="site-header">
        <div className="site-title">
          <strong>DIRTY P FANTASY FOOTBALL</strong>
          <span>THE LEAGUE ARCHIVE · EST. 2014</span>
        </div>
      </header>

      {/* HERO */}
      <section className="rivalry-hero">
        <div>
          <p className="eyebrow">THE DIRTY P SHOWDOWN</p>

          <h1>Rivalry Week</h1>

          <p>
            Five matchups. Five rivalries. One week to settle some shit.
          </p>
        </div>

        <div className="rivalry-count">
          <strong>5</strong>
          <span>RIVALRIES</span>
        </div>
      </section>

      {/* NAV */}
      <nav className="page-nav">
        <a href="/">← Home</a>
        <span>RIVALRY WEEK</span>
      </nav>

      {/* RIVALRIES */}
      <section className="rivalry-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">2026</p>
            <h2>The Rivalries</h2>
          </div>

          <span>5 Matchups</span>
        </div>

        <div className="rivalry-grid">
          {rivalries.map((rivalry) => (
            <article
              className="rivalry-card"
              key={rivalry.name}
            >
              <div className="rivalry-name">
                <span className="rivalry-emoji">
                  {rivalry.emoji}
                </span>

                <h3>{rivalry.name}</h3>
              </div>

              <div className="rivalry-matchup">
                {rivalry.matchup}
              </div>

              <p className="rivalry-description">
                {rivalry.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <strong>DIRTY P FANTASY FOOTBALL</strong>

        <p>
          Independent fantasy league archive. Not affiliated with or
          endorsed by ESPN.
        </p>
      </footer>
    </main>
  );
}
